import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEMO_ADMIN_EMAIL } from "../server/adminDb";

const ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/**
 * The demo account is created once, on the first boot against an empty database.
 * Changing the seeded address afterwards therefore does nothing on an install
 * that has already been seeded — which is exactly how the dashboard came to
 * advertise `safety@trufrenz.net` while its only account still answered to
 * `safety@trufrenz.app`. The hinted email and password simply failed with
 * "those credentials were not accepted", and nothing in the test suite noticed
 * because the seed and the hint are separate files.
 *
 * These are cheap, static checks over the pair that must agree. They cannot
 * prove the password matches the stored hash without a database, but they do
 * catch the drift that actually happened.
 */
describe("demo admin credentials advertised on the login page", () => {
  it("advertises the email the seed actually creates", () => {
    const html = read("admin/index.html");
    const js = read("admin/app.js");

    expect(html).toContain(DEMO_ADMIN_EMAIL);
    expect(js).toContain(DEMO_ADMIN_EMAIL);
  });

  it("advertises the account route the server accepts", () => {
    // The public hint on the server must name the same account, or an operator
    // reading the API documentation would enrol the wrong address.
    const routes = read("server/adminRoutes.ts");
    expect(routes).toContain(DEMO_ADMIN_EMAIL);
  });

  it("documents a password that the login form will accept", () => {
    // The password is shown once, in a details block, so an operator can sign
    // in. It must be a real value rather than a placeholder.
    const html = read("admin/index.html");
    expect(html).toMatch(/Trufrenz#\w+/);
  });
});