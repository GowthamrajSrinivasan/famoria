import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AIAnalysisResult } from "../types";

// Helper to get AI instance lazily.
// This prevents the app from crashing on startup if process.env.API_KEY is not yet available,
// which fixes the "Container failed to start" error.
const getAI = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/* ----------------------- SCHEMA ----------------------- */
const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    caption: { type: Type.STRING },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    suggestedAlbum: { type: Type.STRING },
  },
  required: ["caption", "tags", "suggestedAlbum"],
};

/* ====================== HELPER: PREPARE IMAGE ====================== */

async function prepareImagePart(input: string): Promise<{ mimeType: string; data: string }> {
  // Case 1: Already a Base64 Data URI
  if (input.startsWith("data:")) {
    const mimeMatch = input.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const data = input.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    return { mimeType, data };
  }

  // Case 2: Remote URL (e.g., Unsplash)
  try {
    const response = await fetch(input, { mode: 'cors' });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        const mimeMatch = base64data.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : blob.type || "image/jpeg";
        const data = base64data.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
        resolve({ mimeType, data });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error converting URL to Base64:", error);
    throw new Error("Could not process image URL. Please try uploading a file directly.");
  }
}

/* ====================== ANALYZE IMAGE ====================== */

export const analyzeImage = async (
  imageInput: string
): Promise<AIAnalysisResult> => {
  try {
    const ai = getAI();
    const imagePart = await prepareImagePart(imageInput);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: imagePart.mimeType,
              data: imagePart.data,
            },
          },
          {
            text: "Analyze this family photo. Create a heartwarming caption, 3–5 tags, and a short album name.",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction: "You are a warm, nostalgic AI assistant for a family photo app named Famoria.",
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from Gemini");

    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      caption: "A beautiful memory.",
      tags: ["Family", "Memory"],
      suggestedAlbum: "General",
    };
  }
};

/* ====================== EDIT IMAGE ====================== */

export const editImageWithAI = async (
  imageInput: string,
  prompt: string
): Promise<string> => {
  try {
    const ai = getAI();
    const imagePart = await prepareImagePart(imageInput);

    // Used 'gemini-2.5-flash-image' for broader compatibility and to avoid 403 Permission Denied errors
    // that can occur with 'gemini-3-pro-image-preview' on certain API keys.
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: imagePart.mimeType,
              data: imagePart.data,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];

    // Look for image part
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    // Check for text refusal/error
    const textPart = parts.find(p => p.text);
    if (textPart) {
      console.warn("Gemini returned text:", textPart.text);
      throw new Error(textPart.text || "AI returned text instead of an image");
    }

    throw new Error("No edited image returned by Gemini");
  } catch (error) {
    console.error("AI Editing Error:", error);
    throw error;
  }
};