import base from "../../application/ui/vitest.config.ts"
import { uninstallConfig } from "./uninstall-config.mts"

export default uninstallConfig(base, process.env.NOVADECK_UNINSTALL_OUTPUT, "file")
