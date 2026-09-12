import { describe, expect, test } from "bun:test";
import { parseDirectoryGymNames } from "../src/utils/gymDirectory";

/** One embedded WordPress post, shaped like the directory page's own payload. */
const post = (title: string, status = "publish", type = "gyms") =>
    `"ID":1,"post_author":"5","post_date":"2025-01-31 14:07:37","post_title":"${title}",` +
    `"post_excerpt":"","post_status":"${status}","comment_status":"closed","ping_status":"closed",` +
    `"post_password":"","post_name":"x","to_ping":"","pinged":"","post_modified":"2026-07-15 16:27:03",` +
    `"post_modified_gmt":"2026-07-15 08:27:03","post_content_filtered":"","post_parent":0,` +
    `"guid":"https://revofitness.com.au/?post_type=gyms&#038;p=1","menu_order":0,"post_type":"${type}",` +
    `"post_mime_type":"","comment_count":"0"`;

describe("parseDirectoryGymNames", () => {
    test("collects the published gyms from the page payload", () => {
        const html = `window.page = [{${post("Nunawading")}},{${post("O'Connor")}},{${post("Pitt St")}}];`;

        expect(parseDirectoryGymNames(html)).toEqual(["Nunawading", "O'Connor", "Pitt St"]);
    });

    test("ignores drafts and posts that are not gyms", () => {
        const html = `[{"a":1},{${post("Trinity Gardens", "draft")}},{${post("A blog post", "publish", "post")}}]`;

        expect(parseDirectoryGymNames(html)).toEqual([]);
    });

    test("returns nothing when the page carries no embedded post list", () => {
        expect(parseDirectoryGymNames("<html><body>Nothing here</body></html>")).toEqual([]);
    });
});
