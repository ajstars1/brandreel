// The contract between the render page and the Node renderer.
export interface ReelApi {
  duration: number;
  width: number;
  height: number;
  seek: (time: number) => void;
  error?: string;
}

declare global {
  interface Window { brandreel?: ReelApi }
}
