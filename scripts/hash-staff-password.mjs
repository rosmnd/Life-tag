import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

function readPassword() {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal so the password can be entered without echo.");
  }

  process.stdout.write("New staff password (input hidden): ");
  input.setRawMode(true);
  input.setEncoding("utf8");
  input.resume();

  return new Promise((resolve, reject) => {
    let password = "";
    const finish = (error) => {
      input.setRawMode(false);
      input.pause();
      input.off("data", onData);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(password);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Password generation cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          password = Array.from(password).slice(0, -1).join("");
        } else {
          password += character;
        }
      }
    };
    input.on("data", onData);
  });
}

try {
  const password = await readPassword();
  if (password.length < 12) throw new Error("Use a unique password with at least 12 characters.");

  const salt = randomBytes(16);
  const passwordHash = await scrypt(password, salt, 64);
  const sessionSecret = randomBytes(32).toString("hex");
  console.log(`STAFF_PASSWORD_HASH=scrypt:${salt.toString("hex")}:${passwordHash.toString("hex")}`);
  console.log(`STAFF_SESSION_SECRET=${sessionSecret}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Password hash generation failed.");
  process.exitCode = 1;
}
