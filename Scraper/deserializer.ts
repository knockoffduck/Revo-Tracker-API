/**
 * PHP Serialized Data to JSON Deserializer
 * 
 * Usage: bun run Scraper/deserializer.ts '<serialized_string>'
 * Supports: strings, integers, floats, booleans, null, arrays, and objects (stdClass).
 */

class PHPSerializer {
    private offset: number = 0;
    private data: string = "";

    public unserialize(data: string): any {
        this.offset = 0;
        this.data = data;
        try {
            return this.parse();
        } catch (e: any) {
            throw new Error(`Deserialization failed: ${e.message} at offset ${this.offset}`);
        }
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
            default: 
                const snippet = this.data.substring(this.offset, this.offset + 30);
                throw new Error(`Unknown type '${type}' (snippet: "${snippet}...")`);
        }
    }

    private parseString(): string {
        this.offset += 2; // skip s:
        const lengthEnd = this.data.indexOf(':', this.offset);
        const length = parseInt(this.data.substring(this.offset, lengthEnd));
        this.offset = lengthEnd + 2; // skip :"
        const val = this.data.substring(this.offset, this.offset + length);
        this.offset += length + 2; // skip ";
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
        this.offset += 2; // skip 1; or 0;
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
        this.offset = lengthEnd + 2; // skip :{
        
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
        this.offset = lengthEnd + 2; // skip :"
        const className = this.data.substring(this.offset, this.offset + nameLength);
        this.offset += nameLength + 2; // skip ":

        const countEnd = this.data.indexOf(':', this.offset);
        const count = parseInt(this.data.substring(this.offset, countEnd));
        this.offset = countEnd + 2; // skip :{

        const obj: any = { _php_class: className };
        for (let i = 0; i < count; i++) {
            const key = this.parse();
            const val = this.parse();
            obj[key] = val;
        }
        this.offset += 1; // skip }
        return obj;
    }
}

async function run() {
    let input = process.argv[2];

    if (!input) {
        console.error("Usage: bun run Scraper/deserializer.ts '<serialized_string_or_cookie>'");
        process.exit(1);
    }

    // Handle full cookie strings (e.g., Member=...)
    if (input.includes("=")) {
        input = input.split("=")[1];
    }

    // Auto-detect URL encoding
    if (input.includes("%")) {
        try {
            input = decodeURIComponent(input);
        } catch (e) {}
    }

    const deserializer = new PHPSerializer();
    try {
        const result = deserializer.unserialize(input);
        console.log(JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error("\x1b[31mError:\x1b[0m", e.message);
        process.exit(1);
    }
}

run();
