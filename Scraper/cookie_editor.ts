import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// --- PHP Serialization/Deserialization Logic ---

class PHPSerializer {
    private offset: number = 0;
    private data: string = "";

    constructor() {}

    public unserialize(data: string): any {
        this.offset = 0;
        this.data = data;
        return this.parse();
    }

    private parse(): any {
        const type = this.data.charAt(this.offset);
        switch (type) {
            case 's': return this.parseString();
            case 'i': return this.parseInteger();
            case 'd': return this.parseFloat();
            case 'b': return this.parseBoolean();
            case 'N': return this.parseNull();
            case 'a': return this.parseArray();
            case 'O': return this.parseObject();
            default: throw new Error(`Unknown type '${type}' at offset ${this.offset}: ${this.data.substring(this.offset, this.offset + 20)}...`);
        }
    }

    private parseString(): string {
        this.offset += 2; // skip s:
        const lengthEnd = this.data.indexOf(':', this.offset);
        const length = parseInt(this.data.substring(this.offset, lengthEnd));
        this.offset = lengthEnd + 2; // skip : "
        const val = this.data.substring(this.offset, this.offset + length);
        this.offset += length + 2; // skip " ;
        return val;
    }

    private parseInteger(): number {
        this.offset += 2; // skip i:
        const valEnd = this.data.indexOf(';', this.offset);
        const val = parseInt(this.data.substring(this.offset, valEnd));
        this.offset = valEnd + 1;
        return val;
    }

    private parseFloat(): number {
        this.offset += 2; // skip d:
        const valEnd = this.data.indexOf(';', this.offset);
        const val = parseFloat(this.data.substring(this.offset, valEnd));
        this.offset = valEnd + 1;
        return val;
    }

    private parseBoolean(): boolean {
        this.offset += 2; // skip b:
        const val = this.data.charAt(this.offset) === '1';
        this.offset += 2; // skip 0/1 ;
        return val;
    }

    private parseNull(): null {
        this.offset += 2; // skip N;
        return null;
    }

    private parseArray(): any {
        this.offset += 2; // skip a:
        const lengthEnd = this.data.indexOf(':', this.offset);
        const length = parseInt(this.data.substring(this.offset, lengthEnd));
        this.offset = lengthEnd + 2; // skip : {

        const arr: any = {};
        for (let i = 0; i < length; i++) {
            const key = this.parse();
            const val = this.parse();
            arr[key] = val;
        }
        this.offset += 1; // skip }
        return arr;
    }

    private parseObject(): any {
        this.offset += 2; // skip O:
        const lengthEnd = this.data.indexOf(':', this.offset);
        const nameLength = parseInt(this.data.substring(this.offset, lengthEnd));
        this.offset = lengthEnd + 2; // skip : "
        const className = this.data.substring(this.offset, this.offset + nameLength);
        this.offset += nameLength + 2; // skip " :

        const countEnd = this.data.indexOf(':', this.offset);
        const count = parseInt(this.data.substring(this.offset, countEnd));
        this.offset = countEnd + 2; // skip : {

        const obj: any = { __PHP_CLASS_NAME__: className };
        for (let i = 0; i < count; i++) {
            const key = this.parse();
            const val = this.parse();
            obj[key] = val;
        }
        this.offset += 1; // skip }
        return obj;
    }

    public serialize(value: any): string {
        if (value === null) return 'N;';
        if (typeof value === 'boolean') return `b:${value ? 1 : 0};`;
        if (typeof value === 'number') {
            if (Number.isInteger(value)) return `i:${value};`;
            return `d:${value};`;
        }
        if (typeof value === 'string') return `s:${value.length}:"${value}";`;

        if (typeof value === 'object') {
            if (value.__PHP_CLASS_NAME__) {
                const className = value.__PHP_CLASS_NAME__;
                const props = Object.keys(value).filter(k => k !== '__PHP_CLASS_NAME__');
                let inner = '';
                for (const key of props) {
                    inner += this.serialize(key) + this.serialize(value[key]);
                }
                return `O:${className.length}:"${className}":${props.length}:{${inner}}`;
            } else {
                const keys = Object.keys(value);
                let inner = '';
                for (const key of keys) {
                    inner += this.serialize(key) + this.serialize(value[key]);
                }
                return `a:${keys.length}:{${inner}}`;
            }
        }
        return '';
    }
}

// --- Diffing Logic ---

function flattenObject(obj: any, prefix = ""): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof val === 'object' && val !== null && !Array.isArray(val) && !key.startsWith('__PHP')) {
            Object.assign(result, flattenObject(val, fullKey));
        } else {
            result[fullKey] = val;
        }
    }
    return result;
}

function diffObjects(a: any, b: any): Record<string, { a: any; b: any }> {
    const flatA = flattenObject(a);
    const flatB = flattenObject(b);
    const allKeys = new Set([...Object.keys(flatA), ...Object.keys(flatB)]);
    const diffs: Record<string, { a: any; b: any }> = {};
    for (const key of allKeys) {
        if (flatA[key] !== flatB[key]) {
            diffs[key] = { a: flatA[key], b: flatB[key] };
        }
    }
    return diffs;
}

function summarizeDiffs(diffs: Record<string, { a: any; b: any }>, labelA = "Cookie 0", labelB = "Other"): string {
    const lines: string[] = [];
    for (const [key, { a, b }] of Object.entries(diffs)) {
        lines.push(`  ${key}:`);
        lines.push(`    ${labelA}: ${JSON.stringify(a)}`);
        lines.push(`    ${labelB}: ${JSON.stringify(b)}`);
    }
    return lines.join("\n");
}

// --- Main CLI ---

const serializer = new PHPSerializer();

function parseCookie(raw: string): any {
    let decoded = raw;
    if (raw.includes("%")) decoded = decodeURIComponent(raw);
    if (decoded.startsWith("Member=")) decoded = decoded.slice(7);
    return serializer.unserialize(decoded);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log("Usage:");
        console.log("  bun run Scraper/cookie_editor.ts <cookie_string>              # decode + print one cookie");
        console.log("  bun run Scraper/cookie_editor.ts <input.json> --diff <cookieN> # diff all cookies in JSON vs cookieN");
        console.log("  bun run Scraper/cookie_editor.ts <input.json> --diff-all        # diff all cookies against each other");
        console.log("  bun run Scraper/cookie_editor.ts <input.json> --serialize       # re-serialize all cookies");
        console.log("  bun run Scraper/cookie_editor.ts <input.json> --output <file.json>  # save parsed cookies to JSON");
        process.exit(0);
    }

    const inputPath = args[0];
    const isJsonFile = inputPath.endsWith(".json") && existsSync(inputPath);

    if (!isJsonFile) {
        // Single cookie decode
        const raw = args[0];
        const data = parseCookie(raw);
        console.log(JSON.stringify(data, null, 2));
        return;
    }

    // Load JSON file
    const rawContent = readFileSync(inputPath, "utf-8");
    let cookieStrings: string[];
    try {
        const parsed = JSON.parse(rawContent);
        if (Array.isArray(parsed)) {
            cookieStrings = parsed;
        } else if (typeof parsed === "object" && parsed !== null) {
            // Treat as a cookies object (e.g. { "cookies": [...] } or just keys with cookie values)
            const keys = Object.keys(parsed);
            cookieStrings = keys.map(k => (parsed as any)[k]);
        } else {
            console.error("JSON must be an array or object of cookie strings.");
            process.exit(1);
        }
    } catch (e) {
        console.error("Failed to parse JSON file:", e);
        process.exit(1);
    }

    console.log(`Loaded ${cookieStrings.length} cookies from ${inputPath}`);

    // Parse all cookies
    const parsed = cookieStrings.map((c, i) => {
        try {
            return { index: i, data: parseCookie(c), error: null };
        } catch (e: any) {
            return { index: i, data: null, error: e.message };
        }
    });

    const hasErrors = parsed.some(p => p.error !== null);
    if (hasErrors) {
        console.error("\nFailed to parse some cookies:");
        for (const p of parsed) {
            if (p.error) console.error(`  Cookie ${p.index}: ${p.error}`);
        }
        process.exit(1);
    }

    // Handle commands
    if (args.includes("--diff-all")) {
        console.log("\n=== PAIRWISE DIFFS (first cookie vs each subsequent) ===\n");
        const base = parsed[0].data;
        for (let i = 1; i < parsed.length; i++) {
            console.log(`--- Cookie 0 vs Cookie ${i} ---`);
            const diffs = diffObjects(base, parsed[i].data);
            if (Object.keys(diffs).length === 0) {
                console.log("  (no differences)");
            } else {
                console.log(summarizeDiffs(diffs, `Cookie 0 (${cookieStrings[0].slice(7, 40)}...)`, `Cookie ${i}`));
            }
            console.log();
        }
        return;
    }

    const diffIndex = args.indexOf("--diff");
    if (diffIndex !== -1 && args[diffIndex + 1] !== undefined) {
        const targetRaw = args[diffIndex + 1];
        const targetCookie = parseCookie(targetRaw);
        console.log(`\n=== DIFFING ALL COOKIES vs provided cookie ===\n`);
        for (let i = 0; i < parsed.length; i++) {
            const diffs = diffObjects(parsed[i].data, targetCookie);
            if (Object.keys(diffs).length === 0) {
                console.log(`Cookie ${i}: IDENTICAL`);
            } else {
                console.log(`--- Cookie ${i} vs target ---`);
                console.log(summarizeDiffs(diffs, `Cookie ${i}`, "Target"));
            }
            console.log();
        }
        return;
    }

    if (args.includes("--serialize")) {
        console.log("\n=== RE-SERIALIZED COOKIES ===\n");
        const output = cookieStrings.map(c => {
            const data = parseCookie(c);
            const ser = serializer.serialize(data);
            return `Member=${encodeURIComponent(ser)}`;
        });
        console.log(JSON.stringify(output, null, 2));
        return;
    }

    const outputIndex = args.indexOf("--output");
    if (outputIndex !== -1 && args[outputIndex + 1] !== undefined) {
        const outPath = args[outputIndex + 1];
        const output = parsed.map(p => p.data);
        writeFileSync(outPath, JSON.stringify(output, null, 2));
        console.log(`Wrote ${output.length} parsed cookies to ${outPath}`);
        return;
    }

    // Default: print all parsed cookies
    for (const p of parsed) {
        console.log(`\n=== COOKIE ${p.index} ===`);
        console.log(JSON.stringify(p.data, null, 2));
    }
}

main();
