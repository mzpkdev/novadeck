// The recipe classes a dialog built on the page, rather than with ConfirmDialog, puts on
// its backdrop and its content: the overlay and modal recipes, which draw them and fade
// and drop them in and out with their data-state.
export const modalMotion = { backdrop: "overlay", dialog: "modal" } as const
