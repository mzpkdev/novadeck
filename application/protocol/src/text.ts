/**
 * Characters that draw as nothing, or as a blank, though they aren't a plain space, tab or
 * line end: control and format characters, the ones Unicode says to ignore when drawing
 * (joiners, variation selectors, tags), unassigned code points, other spaces, and the
 * fillers that draw blank. Between short runs of spaces they wrap a line into blank rows,
 * so part of a command could hide behind them. One rule for the runner, which refuses
 * them in a command an agent asks the person to run, and the Inbox, which marks them in
 * one a harness shows verbatim.
 */
export const hiddenCharacter =
  /(?![\t\n])[\p{Cc}\p{Cf}\p{Cn}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}⠀]|(?! )\p{Zs}/u

/** The most lines a command an agent asks the person to run may hold. */
export const maxCommandLines = 40
