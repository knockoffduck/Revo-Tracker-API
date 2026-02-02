import { writeFileSync } from "fs";

// --- PHP Serialization/Deserialization Logic ---

class PHPSerializer {
    private offset: number = 0;
    private data: string = "";

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
            default: throw new Error(`Unknown type '${type}'`);
        }
    }

    private parseString(): string {
        this.offset += 2;
        const lengthEnd = this.data.indexOf(':', this.offset);
        const length = parseInt(this.data.substring(this.offset, lengthEnd));
        this.offset = lengthEnd + 2;
        const val = this.data.substring(this.offset, this.offset + length);
        this.offset += length + 2;
        return val;
    }

    private parseInteger(): number {
        this.offset += 2;
        const valEnd = this.data.indexOf(';', this.offset);
        const val = parseInt(this.data.substring(this.offset, valEnd));
        this.offset = valEnd + 1;
        return val;
    }

    private parseFloat(): number {
        this.offset += 2;
        const valEnd = this.data.indexOf(';', this.offset);
        const val = parseFloat(this.data.substring(this.offset, valEnd));
        this.offset = valEnd + 1;
        return val;
    }

    private parseBoolean(): boolean {
        this.offset += 2;
        const val = this.data.charAt(this.offset) === '1';
        this.offset += 2;
        return val;
    }

    private parseNull(): null {
        this.offset += 2;
        return null;
    }

    private parseArray(): any {
        this.offset += 2;
        const lengthEnd = this.data.indexOf(':', this.offset);
        const length = parseInt(this.data.substring(this.offset, lengthEnd));
        this.offset = lengthEnd + 2;
        const arr: any = {};
        for (let i = 0; i < length; i++) {
            const key = this.parse();
            const val = this.parse();
            arr[key] = val;
        }
        this.offset += 1;
        return arr;
    }

    private parseObject(): any {
        this.offset += 2;
        const lengthEnd = this.data.indexOf(':', this.offset);
        const nameLength = parseInt(this.data.substring(this.offset, lengthEnd));
        this.offset = lengthEnd + 2;
        const className = this.data.substring(this.offset, this.offset + nameLength);
        this.offset += nameLength + 2;
        const countEnd = this.data.indexOf(':', this.offset);
        const count = parseInt(this.data.substring(this.offset, countEnd));
        this.offset = countEnd + 2;
        const obj: any = { __PHP_CLASS_NAME__: className };
        for (let i = 0; i < count; i++) {
            const key = this.parse();
            const val = this.parse();
            obj[key] = val;
        }
        this.offset += 1;
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
                for (const key of props) inner += this.serialize(key) + this.serialize(value[key]);
                return `O:${className.length}:"${className}":${props.length}:{${inner}}`;
            } else {
                const keys = Object.keys(value);
                let inner = '';
                for (const key of keys) inner += this.serialize(key) + this.serialize(value[key]);
                return `a:${keys.length}:{${inner}}`;
            }
        }
        return '';
    }
}

// --- Generator Helpers ---

const firstNames = ["James", "Sarah", "Michael", "Emma", "David", "Chloe", "Daniel", "Grace", "Liam", "Ava"];
const lastNames = ["Wilson", "Taylor", "Anderson", "Thomas", "Moore", "White", "Harris", "Martin", "Clark", "Lewis"];
const cities = ["Perth", "North Perth", "Subiaco", "Fremantle", "Joondalup", "Canning Vale", "Scaborough"];

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomizeProfile(data: any) {
    // 1. Keep Fixed Values
    // memberType, isPaymentInProgress, isActive (Assuming they match reference or setting them explicitly)
    data.memberType = "Member";
    data.isPaymentInProgress = false;
    data.isActive = true;

    // 2. Randomize Identity
    data.firstName = firstNames[randomInt(0, firstNames.length - 1)];
    data.lastName = lastNames[randomInt(0, lastNames.length - 1)];
    data.number = randomInt(110000000, 199999999).toString();
    data.phoneNumber = `+614${randomInt(10000000, 99999999)}`;
    data.email = `${data.firstName.toLowerCase()}.${data.lastName.toLowerCase()}${randomInt(10, 99)}@gmail.com`;
    data.sex = Math.random() > 0.5 ? "Male" : "Female";
    data.id = randomInt(700000, 800000);
    
    // 3. Date of Birth (ensure > 18 years)
    // Current year is 2026. 18 years ago was 2008.
    const birthYear = randomInt(1970, 2007); 
    const birthMonth = randomInt(1, 12);
    const birthDay = randomInt(1, 28);
    data.birthdate = `${birthYear}-${birthMonth.toString().padStart(2, '0')}-${birthDay.toString().padStart(2, '0')}T00:00:00+08:00`;

    // 4. Address Details
    if (data.address) {
        data.address.street = `${randomInt(1, 150)} New Road`;
        data.address.postalCode = randomInt(6000, 6999).toString();
        data.address.city = cities[randomInt(0, cities.length - 1)];
        data.address.memberId = data.id; // Keep in sync
    }

    // 5. Meta
    data.version = Math.floor(Date.now() / 1000) - randomInt(0, 1000000);
}

const DEFAULT_STR = "O%3A8%3A%22stdClass%22%3A25%3A%7Bs%3A9%3A%22firstName%22%3Bs%3A5%3A%22Daffa%22%3Bs%3A10%3A%22secondName%22%3Bs%3A0%3A%22%22%3Bs%3A8%3A%22lastName%22%3Bs%3A11%3A%22Fathurohman%22%3Bs%3A10%3A%22homeClubId%22%3Bi%3A10%3Bs%3A8%3A%22isActive%22%3Bb%3A1%3Bs%3A11%3A%22isForeigner%22%3Bb%3A0%3Bs%3A6%3A%22number%22%3Bs%3A9%3A%22109012239%22%3Bs%3A11%3A%22phoneNumber%22%3Bs%3A12%3A%22%2B61415131283%22%3Bs%3A5%3A%22email%22%3Bs%3A16%3A%22ddarm4%40gmail.com%22%3Bs%3A10%3A%22personalId%22%3BN%3Bs%3A3%3A%22sex%22%3Bs%3A4%3A%22Male%22%3Bs%3A9%3A%22birthdate%22%3Bs%3A25%3A%222003-08-12T00%3A00%3A00%2B08%3A00%22%3Bs%3A12%3A%22consultantId%22%3Bi%3A3%3Bs%3A12%3A%22referralCode%22%3Bs%3A6%3A%222LE2TY%22%3Bs%3A19%3A%22isPaymentInProgress%22%3Bb%3A0%3Bs%3A10%3A%22memberType%22%3Bs%3A6%3A%22Member%22%3Bs%3A23%3A%22emailVerificationStatus%22%3Bs%3A4%3A%22None%22%3Bs%3A29%3A%22phoneNumberVerificationStatus%22%3Bs%3A4%3A%22None%22%3Bs%3A13%3A%22citizenshipId%22%3BN%3Bs%3A11%3A%22createdDate%22%3Bs%3A25%3A%222023-07-09T15%3A22%3A29%2B08%3A00%22%3Bs%3A9%3A%22isDeleted%22%3Bb%3A0%3Bs%3A7%3A%22version%22%3Bi%3A1662817461%3Bs%3A2%3A%22id%22%3Bi%3A776473%3Bs%3A7%3A%22address%22%3BO%3A8%3A%22stdClass%22%3A7%3A%7Bs%3A6%3A%22street%22%3Bs%3A10%3A%2243%20view%20st%22%3Bs%3A21%3A%22additionalAddressLine%22%3BN%3Bs%3A10%3A%22postalCode%22%3Bs%3A4%3A%226006%22%3Bs%3A4%3A%22city%22%3Bs%3A11%3A%22North%20Perth%22%3Bs%3A5%3A%22state%22%3BN%3Bs%3A7%3A%22country%22%3Bs%3A9%3A%22Australia%22%3Bs%3A8%3A%22memberId%22%3Bi%3A776473%3B%7Ds%3A15%3A%22membershipLevel%22%3Bi%3A1%3B%7D";

function main() {
    const serializer = new PHPSerializer();
    const results = [];
    
    for (let i = 0; i < 5; i++) {
        const data = serializer.unserialize(decodeURIComponent(DEFAULT_STR));
        randomizeProfile(data);
        const serialized = serializer.serialize(data);
        results.push(`Member=${encodeURIComponent(serialized)}`);
    }

    writeFileSync("/Users/daffydvck/Projects/Revo-Tracker-API/Scraper/cookies.json", JSON.stringify(results, null, 2));
    console.log("Successfully generated 5 cookies and saved to Scraper/cookies.json");
}

main();
