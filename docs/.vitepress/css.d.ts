// The demos import the stylesheet for its side effect; Vite resolves it, tsc
// needs to be told it exists.
declare module '@headless-canvas/ui/styles.css'
