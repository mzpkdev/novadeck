import type { StorybookConfig } from "@storybook/react-vite"

export default {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  core: {
    disableWhatsNewNotifications: true,
  },
  features: {
    menuOnboardingChecklist: false,
    sidebarOnboardingChecklist: false,
  },
} satisfies StorybookConfig
