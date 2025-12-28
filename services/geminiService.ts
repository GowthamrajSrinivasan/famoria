import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AIAnalysisResult } from "../types";

// Helper to get AI instance lazily.
// This prevents the app from crashing on startup if the API key is not yet available,
// which fixes the "Container failed to start" error.
const getAI = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({ apiKey });
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
            text: "Analyze this image and provide: a warm family-oriented caption, relevant tags for categorization, and suggest an album name. Respond in JSON format.",
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
  } catch (error: any) {
    // Silently return defaults when API fails (expired key, network issues, etc.)
    // This prevents error spam in console while app still functions

    // Only log once per session
    if (!sessionStorage.getItem('gemini_warning_shown')) {
      console.warn('⚠️ Gemini AI is unavailable (API key may be expired). Using default values.');
      console.info('💡 Get a new API key at: https://makersuite.google.com/app/apikey');
      sessionStorage.setItem('gemini_warning_shown', 'true');
    }

    // Return default values - app still works without AI
    return {
      caption: "A beautiful memory.",
      tags: ["Family", "Memory"],
      suggestedAlbum: "General",
    };
  }
};

/* ====================== ANALYZE MULTIPLE IMAGES (Multi-Post) ====================== */

export const analyzeMultipleImages = async (
  imageInputs: string[]
): Promise<AIAnalysisResult> => {
  try {
    const ai = getAI();

    // Prepare all image parts (limit to 10 as per spec)
    const limitedInputs = imageInputs.slice(0, 10);
    const imageParts = await Promise.all(
      limitedInputs.map(input => prepareImagePart(input))
    );

    // Build content parts: all images + text prompt
    const parts = [
      ...imageParts.map(imagePart => ({
        inlineData: {
          mimeType: imagePart.mimeType,
          data: imagePart.data,
        },
      })),
      {
        text: `Analyze these ${imageParts.length} family photos as a collection. Create a unified heartwarming caption that describes the set of images together, extract 3-5 relevant tags, and suggest a short album name that captures the theme.`,
      },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction: "You are a warm, nostalgic AI assistant for a family photo app named Famoria. You're analyzing multiple images that will be posted together, so create a caption that describes the collection as a whole.",
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from Gemini");

    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Multi-Image Analysis Error:", error);
    return {
      caption: "A beautiful collection of memories.",
      tags: ["Family", "Memory", "Collection"],
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