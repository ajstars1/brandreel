// The contract between the render page and the Node renderer.
export interface ReelApi {
  duration: number;
  width: number;
  height: number;
  seek: (time: number) => void;
  // Mechanical checks on one scene at the current time: collapsed layout, overflow, tiny text.
  audit?: (sceneIndex: number) => string[];
  error?: string;
}

declare global {
  interface Window { brandreel?: ReelApi }
}
