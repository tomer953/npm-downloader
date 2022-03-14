const { JSONPath } = require("jsonpath-plus");
const fsp = require("fs/promises");
const { ensureDir } = require("fs-extra");
const PQueue = require("p-queue").default;
const { createHash } = require("crypto");
const path = require("path");
const glob = require("glob");
const { command } = require("execa");

async function main() {
  try {
    console.time("total-time");
    
    // read package-lock.json file
    const jsonString = await fsp.readFile("./react.json", "utf8");
    const json = JSON.parse(jsonString);

    // reading deps
    let deps = getDeps(json);
    console.log('total deps', deps.length);

    // packing deps
    await packAllDeps(deps);

    // calc hash
    glob("files/**/*.tgz", async (err, files) => {
      await calcFilesHash(files);
      console.timeEnd("total-time");
    });

  } catch (error) {
    console.log(error);
  }
}


function getDeps(json) {
  console.time("readDeps");

  const deps = [];
  
  // read all dependencies in the json recursivly
  JSONPath({
    path: "$..dependencies.[version]",
    json,
    resultType: "all",
    callback: (def) => {
      // extract package version
      let version = def.value;

      // extract package name from path
      let splitPointer = def.pointer.split("/");
      let name = splitPointer[splitPointer.length - 2];
      if (name.startsWith("@")) {
        name = name.replace("~1", "/");
      }
      // add to array if not exists
      if (!deps.find((x) => x.name == name && x.version == version)) {
        deps.push({ name, version });
      }
    },
  });
  console.timeEnd("readDeps");
  return deps;
}



async function packAllDeps(deps) {
  console.time("packTime");
  const rootFolder = "files";
  
  // prepare queue
  const queue = new PQueue({ concurrency: 50 });

  // create array of functions: () => async job , for the queue
  let fns = deps.map((dep) => async () => {
    let { name, version } = dep;
    let cwd = path.join(rootFolder, name, "-");
    await ensureDir(cwd);
    await command(`npm pack ${name}@${version}`, { cwd });
  });

  // start execate
  await queue.addAll(fns);
  console.timeEnd("packTime");
}

/**
 * 
 * @param filesPath array contains files path to calc their hash
 * @returns array of objects that contains the sha256 of each file
 */
async function calcFilesHash(filesPath) {
  console.time("hashTime");

  let results = [];

  const queue = new PQueue({ concurrency: 10 });
  let fns = filesPath.map((file) => async () => {
    // read file as buffer, and calc sha256
    let fileBuffer = await fsp.readFile(file);
    let sha256 = createHash("sha256").update(fileBuffer).digest("hex");
    // save result to array
    results.push({ file, sha256 });
  });

  // start execuate
  await queue.addAll(fns);
  console.timeEnd("hashTime");
  return results;
}


main();
