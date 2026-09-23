import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

/**
 * The profile photo.
 *
 * The file goes straight from the phone to storage with the person's own session, so a picture never passes
 * through the API, and storage only lets somebody write inside a folder named after their own account. The
 * profile keeps the address, which is what everyone else reads.
 */

/** All we need from whatever the picker hands back, so this file does not depend on its type exports. */
export type PickedPhoto = { uri: string; mimeType?: string | null };

const BUCKET = 'avatars';
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Opens the photos, or returns null if they closed it or said no. Throws with something worth reading. */
export async function pickPhoto(from: 'library' | 'camera'): Promise<PickedPhoto | null> {
  const permission =
    from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      from === 'camera'
        ? 'The app needs the camera to take a photo. You can turn it on in your phone settings.'
        : 'The app needs your photos to pick one. You can turn it on in your phone settings.'
    );
  }

  const options = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7
  };
  const result = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  return result.assets?.[0] ?? null;
}

/** Puts the chosen picture in storage and gives back the address to save on the profile. */
export async function uploadPhoto(userId: string, asset: PickedPhoto): Promise<string> {
  const contentType = asset.mimeType && EXT[asset.mimeType] ? asset.mimeType : 'image/jpeg';
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  // One file per account, replaced each time, so old photos do not pile up in storage.
  const path = `${userId}/avatar.${EXT[contentType]}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(error.message || 'Could not upload that photo. Check your connection and try again.');

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Phones and the app both cache by address, so a changed photo needs a changed address to be seen.
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Removes the file as well as the address, so a deleted photo is really gone. */
export async function deletePhoto(userId: string): Promise<void> {
  const paths = Object.values(EXT).map((e) => `${userId}/avatar.${e}`);
  await supabase.storage.from(BUCKET).remove(paths);
}
