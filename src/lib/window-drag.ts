import { getCurrentWindow } from '@tauri-apps/api/window';

export function startWindowDrag() {
  getCurrentWindow().startDragging().catch((error) => {
    console.error('Failed to start window drag:', error);
  });
}
