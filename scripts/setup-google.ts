import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { z } from "zod";
if (existsSync(".env"))
  throw Error(
    ".env already exists. Preserve and edit it locally; this helper will not overwrite it.",
  );
const prompt = createInterface({ input: stdin, output: stdout });
try {
  console.log(
    "Dedicated test accounts only. Enter configuration locally; never paste credentials into chat. This helper does not connect or write to Google.",
  );
  const inputPath = (
    await prompt.question(
      "Absolute path to downloaded Web OAuth client JSON (outside this repository): ",
    )
  ).trim();
  if (!isAbsolute(inputPath))
    throw Error("Enter an absolute client-file path.");
  const file = realpathSync(inputPath);
  const rel = relative(realpathSync("."), file);
  if (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
    throw Error("Keep the OAuth JSON outside the repository.");
  const client = JSON.parse(readFileSync(file, "utf8")).web;
  if (
    !client?.client_id ||
    !client.client_secret ||
    !client.redirect_uris?.includes("http://127.0.0.1:4317/oauth/callback")
  )
    throw Error(
      "The JSON must be a Web OAuth client with the exact 4317 callback configured.",
    );
  const account = z
    .string()
    .email()
    .parse(
      (await prompt.question("Dedicated test Gmail account: "))
        .trim()
        .toLowerCase(),
    );
  const recipients = (
    await prompt.question(
      "Other test sender addresses you control (comma-separated): ",
    )
  )
    .split(",")
    .map((s) => z.string().email().parse(s.trim().toLowerCase()));
  const calendar = z
    .string()
    .min(1)
    .max(254)
    .regex(/^[a-zA-Z0-9@._+-]+$/)
    .parse((await prompt.question("Owned test calendar ID: ")).trim());
  const normalized = file.replaceAll("\\", "/");
  if (/[\r\n"#]/.test(normalized))
    throw Error(
      "Choose a client-file path without quote, # or newline characters.",
    );
  writeFileSync(
    resolve(".env"),
    `INBOXOPS_MODE=live\nPORT=4317\nOLLAMA_MODEL=qwen3:4b\nOLLAMA_EMBED_MODEL=embeddinggemma\nGOOGLE_OAUTH_CLIENT_FILE="${normalized}"\nTEST_ACCOUNT=${account}\nTEST_RECIPIENTS=${recipients.join(",")}\nTEST_LABEL_NAME=InboxOps-Test\nTEST_CALENDAR_ID=${calendar}\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Wrote ignored .env. No secret contents were copied. Start the app, then connect the dedicated account yourself.",
  );
} finally {
  prompt.close();
}
