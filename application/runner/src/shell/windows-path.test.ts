import { describe, expect, it } from "../test.js"
import { forgetPath, mergePath, pathKey, refreshPath, registryFolders } from "./windows-path.js"

const windows = process.platform === "win32"
// The lookup's answer: each key's values as the registry holds them, unexpanded.
const answer = (machine: object, user: object) =>
  Buffer.from(JSON.stringify({ machine, user }), "utf8").toString("base64")

describe("PATH merged with the registry's", () => {
  it("keeps the folders the app started with first, and adds the ones it lacks", () => {
    expect(
      mergePath("C:\\Browser;C:\\Windows\\system32", [
        "C:\\Windows\\system32",
        "C:\\Users\\me\\.local\\bin",
      ]),
    ).toBe("C:\\Browser;C:\\Windows\\system32;C:\\Users\\me\\.local\\bin")
  })

  it("names each folder once, whatever its case, trailing slash or quotes", () => {
    expect(mergePath("C:\\Program Files\\nodejs\\;;", ["c:\\program files\\NodeJS", ""])).toBe(
      "C:\\Program Files\\nodejs\\",
    )
    expect(mergePath('"C:\\Tools"', ["C:\\Tools"])).toBe('"C:\\Tools"')
  })

  it("keeps a drive's root apart from its current folder", () => {
    expect(mergePath("C:\\", ["C:", "c:\\\\"])).toBe("C:\\;C:")
  })
})

describe("the registry's PATH folders", () => {
  it("are the machine's and then the user's, names beyond ASCII and all", () => {
    expect(
      registryFolders(
        `${answer({ Path: "C:\\Windows;C:\\Git" }, { Path: "C:\\Users\\Łukasz\\bin" })}\r\n`,
      ),
    ).toEqual(["C:\\Windows", "C:\\Git", "C:\\Users\\Łukasz\\bin"])
  })

  it("expand the registry's own variables, not the stale ones the app started with", () => {
    // nvm-windows adds both a variable and a PATH entry naming it, as an install the app
    // started before.
    const folders = registryFolders(
      answer(
        { Path: "%SystemRoot%\\system32;%NVM_SYMLINK%", NVM_SYMLINK: "C:\\nvm4w\\nodejs" },
        { PATH: "%NVM_HOME%;%JAVA_HOME%\\bin;%NOT_SET%", NVM_HOME: "%LOCALAPPDATA%\\nvm" },
      ),
      {
        SystemRoot: "C:\\Windows",
        LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
        NVM_HOME: "stale",
      },
    )
    expect(folders).toEqual([
      "C:\\Windows\\system32",
      "C:\\nvm4w\\nodejs",
      "C:\\Users\\me\\AppData\\Local\\nvm",
      "%JAVA_HOME%\\bin",
      "%NOT_SET%",
    ])
  })

  it("are unknown for an answer that isn't the lookup's", () => {
    expect(registryFolders("not base64 JSON")).toBeUndefined()
    expect(registryFolders(Buffer.from('{"machine":{}}').toString("base64"))).toBeUndefined()
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

  it("reads the registry once at a time, serving the last answer while it reads again", async () => {
    forgetPath()
    let reads = 0
    let answering = ["C:\\First"]
    const read = () => {
      reads += 1
      return Promise.resolve(answering)
    }
    const options = { platform: "win32" as const, maxAgeMs: 50, read }
    const env = { Path: "C:\\Here" }
    // Terminals opened together share one read.
    const together = await Promise.all([refreshPath(env, options), refreshPath(env, options)])
    expect(together.map((one) => one.Path)).toEqual(["C:\\Here;C:\\First", "C:\\Here;C:\\First"])
    expect(reads).toBe(1)
    // Fresh enough: no read at all.
    await refreshPath(env, options)
    expect(reads).toBe(1)
    // Once old, the last answer serves at once, and a new one is read behind it.
    answering = ["C:\\Second"]
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect((await refreshPath(env, options)).Path).toBe("C:\\Here;C:\\First")
    expect(reads).toBe(2)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await refreshPath(env, options)).Path).toBe("C:\\Here;C:\\Second")
    forgetPath()
  })

  it.runIf(windows)("adds the registry's folders to a PATH that lacks them", async () => {
    forgetPath()
    // As Windows spells it, whatever spelling the test runner's own uses.
    const env: NodeJS.ProcessEnv = { Path: "C:\\Nowhere" }
    for (const [name, value] of Object.entries(process.env))
      if (name.toUpperCase() !== "PATH") env[name] = value
    const refreshed = await refreshPath(env)
    const folders = (refreshed.Path ?? "").split(";")
    expect(folders[0]).toBe("C:\\Nowhere")
    expect(folders.length).toBeGreaterThan(1)
    expect(refreshed).not.toHaveProperty("PATH")
    forgetPath()
  })
})
