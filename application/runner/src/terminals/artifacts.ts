/**
 * What a session is told once of the bar beside its terminal (see docs/agent-workspace.md,
 * "Companion pane"): what to show there and what not to, since an agent left to itself
 * shows nothing until asked, or every file it touches once asked. Worded as Novadeck's
 * automatic notice, one paragraph.
 */
export const artifactsNotice =
  "Novadeck: automatic notice, not from the user: beside this terminal is a bar where you " +
  "show the user what you make, with Novadeck's show tool. Show a deliverable when it is " +
  "done, not each file you touch: an image or screenshot, a rendered page or a dev " +
  "server's address, a report, mockup, diagram or generated document, the one file the " +
  "user asked you for, or whatever they ask to see. A source file is one too while it is " +
  "the file you are working on together, so show it and keep it shown; the files a change " +
  "touches on the way aren't, and the user reads those in the diff. Show any other " +
  "deliverable without open when you finish it, and with open only when they asked to see " +
  "it, which a revision of " +
  "something you are iterating on with them is. Showing the same file or page again " +
  "updates it, so one item per deliverable, and while they have it open each save shows " +
  "at once. close takes away what no longer applies, never what they may still be " +
  "looking at unless they asked; showing lists what is there. This notice needs no reply."
