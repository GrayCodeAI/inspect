declare module "screenshot-desktop" {
  interface Display {
    id: string;
    name: string;
    width: number;
    height: number;
  }

  function screenshotDesktop(): Promise<Buffer>;
  namespace screenshotDesktop {
    function listDisplays(): Promise<Display[]>;
  }

  export = screenshotDesktop;
}

declare module "robotjs" {
  export function moveMouse(x: number, y: number): void;
  export function mouseClick(button?: "left" | "right" | "middle", double?: boolean): void;
  export function mouseToggle(down?: "down" | "up", button?: "left" | "right" | "middle"): void;
  export function typeString(text: string): void;
  export function keyTap(key: string, modifier?: string[]): void;
  export function keyToggle(key: string, down: "down" | "up", modifier?: string[]): void;
  export function scrollMouse(x: number, y: number): void;
  export function getScreenSize(): { width: number; height: number };
}
