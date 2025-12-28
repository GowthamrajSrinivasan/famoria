# Group Selection Debug Guide

## Issue:
After creating an album:
- ✅ **Members checkboxes** ARE ticked when editing
- ❌ **Groups checkboxes** are NOT ticked when editing

## Debug Steps:

### 1. Check Browser Console When Editing Album

Look for these logs:
```
[CreateAlbumModal] ====== EDITING ALBUM ======
[CreateAlbumModal] Album ID: <album_id>
[CreateAlbumModal] Album groups from DB: [array of group IDs]
[CreateAlbumModal] Setting selectedGroups to: [array]
[CreateAlbumModal] Album members from DB: [array of user IDs]
[CreateAlbumModal] Setting selectedMembers to: [array]
[CreateAlbumModal] VERIFY - selectedGroups state: [array]
[CreateAlbumModal] VERIFY - selectedMembers state: [array]
```

### 2. Check These Values:

✅ **If "Album groups from DB" shows array**: Groups were saved correctly  
❌ **If "Album groups from DB" is undefined/null**: Groups not saved  

✅ **If "Setting selectedGroups to" shows array**: State is being set  
❌ **If selectedGroups is empty []**: No groups were saved or loaded  

### 3. Verify Firestore Document:

Open Firebase Console → Firestore → albums collection → your album document

**Check if `groups` field exists:**
```json
{
  "id": "...",
  "name": "123",
  "groups": ["group-id-1", "group-id-2"],  ← Should exist
  "members": ["user-id-1", "user-id-2"],
  ...
}
```

## What Was Fixed:

### 1. Checkbox Styling ✅
- Larger checkboxes (20px vs 16px)
- Orange accent color
- Better visibility

### 2. State Management ✅
- Groups are saved to Firestore (line 272)
- Groups are loaded when editing (line 83)
- State is properly bound to checkboxes (line 447)

### 3. Debug Logging ✅
- Detailed console logs show exact state
- Verification after 100ms to catch async issues

## Possible Issues:

### Issue 1: Groups Not Saved
**Symptoms**: Console shows `Album groups from DB: undefined`
**Solution**: Groups might not be saving during album creation
**Fix**: Check if `selectedGroups` has values before saving

### Issue 2: Groups Not Loaded
**Symptoms**: Console shows groups from DB but checkboxes unchecked
**Solution**: Checkbox binding issue
**Fix**: Verify `selectedGroups.includes(group.id)` is working

### Issue 3: Group IDs Don't Match
**Symptoms**: Groups saved but checkbox doesn't match
**Solution**: Group ID format mismatch
**Fix**: Check if group.id format matches saved format

## Test Steps:

1. **Create Album**:
   - Select 2-3 groups
   - Click Save
   - Check console for save confirmation

2. **Edit Album**:
   - Click edit on the album
   - Check console for "EDITING ALBUM" logs
   - Verify groups array is populated
   - Check if checkboxes are ticked

3. **Compare**:
   - Members checkboxes work?
   - Groups checkboxes don't work?
   - This suggests state loading issue

## Next Actions:

**After testing, report:**
1. What console logs show for groups
2. What Firestore document contains
3. Screenshot of edit modal showing groups
