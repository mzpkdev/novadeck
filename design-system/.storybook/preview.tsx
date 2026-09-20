import type { Preview } from "@storybook/react-vite"

import "../src/styles.css"

const preview: Preview = {
  decorators: [
    (Story) => (
      <div className="novadeck" style={{ minHeight: "100vh", padding: "2rem" }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
}

export default preview
