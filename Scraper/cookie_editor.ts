import { createInterface } from "readline";

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

// --- Randomization Logic ---

function randomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomizeValue(key: string, value: any): any {
    if (value === null) return null;
    const keyLower = key.toLowerCase();
    
    if (typeof value === 'boolean') {
        if (keyLower === 'isactive') return Math.random() > 0.1;
        return Math.random() < 0.5;
    }
    
    if (typeof value === 'number') {
        if (keyLower.includes('id')) {
             if (keyLower.includes('homeclub')) {
                 const clubs = [1, 10, 14, 30, 41, 43, 59, 82];
                 return clubs[randomInt(0, clubs.length - 1)];
             }
             if (keyLower.includes('consultant')) return randomInt(1, 10);
             if (keyLower.includes('version')) return 1662817461 + randomInt(0, 50000000);
             return randomInt(111111, 999111);
        }
        return randomInt(0, 100);
    }
    
    if (typeof value === 'string') {
        if (keyLower.includes('name')) {
            if (value === "") return "";
            const firstNames = ["Daffa", "John", "Jane", "Alex", "Sarah", "Michael", "Emily"];
            const lastNames = ["Fathurohman", "Doe", "Smith", "Johnson", "Brown", "Miller"];
            if (keyLower.includes('first')) return firstNames[randomInt(0, firstNames.length - 1)];
            if (keyLower.includes('last')) return lastNames[randomInt(0, lastNames.length - 1)];
            return firstNames[randomInt(0, 3)];
        }
        if (keyLower.includes('email')) return `user${randomInt(1000,9999)}@gmail.com`;
        if (keyLower.includes('phone')) return `+614${randomInt(10000000, 99999999)}`;
        if (keyLower.includes('date')) {
            const d = new Date();
            d.setFullYear(d.getFullYear() - randomInt(1, 10));
            return d.toISOString().replace('Z', '+08:00'); 
        }
        if (keyLower.includes('code') && keyLower.includes('postal')) return `${randomInt(6000, 6999)}`;
        if (keyLower.includes('referral')) return randomString(6).toUpperCase();
        if (keyLower === 'sex') return Math.random() > 0.5 ? 'Male' : 'Female';
        if (keyLower.includes('street')) return `${randomInt(1, 100)} Random St`;
        if (keyLower.includes('city')) return ["Perth", "North Perth", "Subiaco", "Fremantle"][randomInt(0, 3)];
        if (keyLower === 'number') return `${randomInt(100000000, 999999999)}`;
        return value;
    }
    return value;
}

function randomizeObject(obj: any) {
    for (const key of Object.keys(obj)) {
        if (key === '__PHP_CLASS_NAME__') continue;
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) { 
             randomizeObject(obj[key]);
        } else {
             obj[key] = randomizeValue(key, obj[key]);
        }
    }
}

// --- Interactive Editing Logic ---

async function manualEditObject(obj: any, ask: (q: string) => Promise<string>, path = "") {
    for (const key of Object.keys(obj)) {
        if (key === '__PHP_CLASS_NAME__') continue;
        
        const fullPath = path ? `${path}.${key}` : key;
        const val = obj[key];
        
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
             await manualEditObject(val, ask, fullPath);
        } else {
             const answer = await ask(`${fullPath} [${val}]: `);
             if (answer.trim() !== "") {
                 if (typeof val === 'number') obj[key] = Number(answer);
                 else if (typeof val === 'boolean') obj[key] = (answer === '1' || answer.toLowerCase() === 'true');
                 else obj[key] = answer;
             }
        }
    }
}

// --- Main CLI ---

const DEFAULT_COOKIE_VALUE = "O%3A8%3A%22stdClass%22%3A25%3A%7Bs%3A9%3A%22firstName%22%3Bs%3A5%3A%22Daffa%22%3Bs%3A10%3A%22secondName%22%3Bs%3A0%3A%22%22%3Bs%3A8%3A%22lastName%22%3Bs%3A11%3A%22Fathurohman%22%3Bs%3A10%3A%22homeClubId%22%3Bi%3A10%3Bs%3A8%3A%22isActive%22%3Bb%3A1%3Bs%3A11%3A%22isForeigner%22%3Bb%3A0%3Bs%3A6%3A%22number%22%3Bs%3A9%3A%22109012239%22%3Bs%3A11%3A%22phoneNumber%22%3Bs%3A12%3A%22%2B61415131283%22%3Bs%3A5%3A%22email%22%3Bs%3A16%3A%22ddarm4%40gmail.com%22%3Bs%3A10%3A%22personalId%22%3BN%3Bs%3A3%3A%22sex%22%3Bs%3A4%3A%22Male%22%3Bs%3A9%3A%22birthdate%22%3Bs%3A25%3A%222003-08-12T00%3A00%3A00%2B08%3A00%22%3Bs%3A12%3A%22consultantId%22%3Bi%3A3%3Bs%3A12%3A%22referralCode%22%3Bs%3A6%3A%222LE2TY%22%3Bs%3A19%3A%22isPaymentInProgress%22%3Bb%3A0%3Bs%3A10%3A%22memberType%22%3Bs%3A6%3A%22Member%22%3Bs%3A23%3A%22emailVerificationStatus%22%3Bs%3A4%3A%22None%22%3Bs%3A29%3A%22phoneNumberVerificationStatus%22%3Bs%3A4%3A%22None%22%3Bs%3A13%3A%22citizenshipId%22%3BN%3Bs%3A11%3A%22createdDate%22%3Bs%3A25%3A%222023-07-09T15%3A22%3A29%2B08%3A00%22%3Bs%3A9%3A%22isDeleted%22%3Bb%3A0%3Bs%3A7%3A%22version%22%3Bi%3A1662817461%3Bs%3A2%3A%22id%22%3Bi%3A776473%3Bs%3A7%3A%22address%22%3BO%3A8%3A%22stdClass%22%3A7%3A%7Bs%3A6%3A%22street%22%3Bs%3A10%3A%2243%20view%20st%22%3Bs%3A21%3A%22additionalAddressLine%22%3BN%3Bs%3A10%3A%22postalCode%22%3Bs%3A4%3A%226006%22%3Bs%3A4%3A%22city%22%3Bs%3A11%3A%22North%20Perth%22%3Bs%3A5%3A%22state%22%3BN%3Bs%3A7%3A%22country%22%3Bs%3A9%3A%22Australia%22%3Bs%3A8%3A%22memberId%22%3Bi%3A776473%3B%7Ds%3A15%3A%22membershipLevel%22%3Bi%3A1%3B%7D";

async function main() {
    let inputStr = DEFAULT_COOKIE_VALUE;
    
    // Check CLI arguments for a custom serialized string
    const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
    if (args.length > 0) {
        inputStr = args[0];
        if (inputStr.includes("=")) inputStr = inputStr.split("=")[1];
    }

    console.log("Decoding Input...");
    const decoded = inputStr.includes('%') ? decodeURIComponent(inputStr) : inputStr;
    
    const serializer = new PHPSerializer();
    let data;
    try {
        data = serializer.unserialize(decoded);
    } catch (e) {
        console.error("\x1b[31mError:\x1b[0m Failed to unserialize! Check your input string.");
        console.error(e);
        process.exit(1);
    }

    const isRandomize = process.argv.includes('--randomize');

    if (isRandomize) {
        console.log("Applying Randomization...");
        randomizeObject(data);
        if (data.id && data.address && data.address.memberId) data.address.memberId = data.id; // Sync IDs
        console.log("Done.");
    } else {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r));
        
        console.log("\n--- Edit Values (Enter to skip) ---");
        await manualEditObject(data, ask);
        rl.close();
    }

    const finalValue = serializer.serialize(data);
    const finalCookie = `Member=${encodeURIComponent(finalValue)}`;

    console.log("\n--- NEW COOKIE STRING ---");
    console.log(finalCookie);
    console.log("-------------------------");
}

main();
