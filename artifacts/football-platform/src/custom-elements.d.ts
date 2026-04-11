// Augment React's JSX IntrinsicElements so TypeScript accepts api-sports-widget custom elements
export {};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "api-sports-widget": {
        [key: string]: unknown;
        key?: string | number;
        ref?: React.Ref<HTMLElement> | null;
      };
    }
  }
}
