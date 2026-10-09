import { describe, expect, it } from "../test.js"
import { mergePath, pathKey, refreshPath, registryFolders } from "./windows-path.js"

const windows = process.platform === "win32"
const answer = (text: string) => Buffer.from(text, "utf8").toString("base64")

describe("PATH merged with the registry's", () => {
  it("keeps the folders the app started with first, and adds the ones it lacks", () => {
    expect(
      mergePath("C:\\Browser;C:\\Windows\\system32", [
        "C:\\Windows\\system32",
        "C:\\Users\\me\\.local\\bin",
      ]),
    ).toBe("C:\\Browser;C:\\Windows\\system32;C:\\Users\\me\\.local\\bin")
  })

  it("names each folder once, whatever its case or trailing slash", () => {
    expect(mergePath("C:\\Program Files\\nodejs\\;;", ["c:\\program files\\NodeJS", ""])).toBe(
      "C:\\Program Files\\nodejs\\",
    )
  })
})

describe("the registry's PATH folders", () => {
  it("are the machine's and then the user's, names beyond ASCII and all", () => {
    expect(registryFolders(`${answer("C:\\Windows;C:\\Git\0C:\\Users\\Łukasz\\bin")}\r\n`)).toEqual(
      ["C:\\Windows", "C:\\Git", "C:\\Users\\Łukasz\\bin"],
    )
  })

  it("are unknown when the answer holds no user part", () => {
    expect(registryFolders(answer("C:\\Windows"))).toBeUndefined()
  })
})

describe("refreshing PATH", () => {
  it("leaves the environment as it is off Windows", async () => {
    const env = { PATH: "/usr/bin" }
    await expect(refreshPath(env, { platform: "linux" })).resolves.toBe(env)
  })

  it("keeps the environment's own spelling of PATH", () => {
    expect(pathKey({ Path: "C:\\Windows" })).toBe("Path")
    expect(pathKey({})).toBe("PATH")
  })

  it.runIf(windows)("adds the registry's folders to a PATH that lacks them", async () => {
    // As Windows spells it, whatever spelling the test runner's own uses.
    const env: NodeJS.ProcessEnv = { Path: "C:\\Nowhere" }
    for (const [name, value] of Object.entries(process.env))
      if (name.toUpperCase() !== "PATH") env[name] = value
    const refreshed = await refreshPath(env)
    const folders = (refreshed.Path ?? "").split(";")
    expect(folders[0]).toBe("C:\\Nowhere")
    expect(folders.length).toBeGreaterThan(1)
    expect(refreshed).not.toHaveProperty("PATH")
  })
})
