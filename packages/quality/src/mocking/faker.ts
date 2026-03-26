// ============================================================================
// @inspect/quality - Fake Data Generators
// ============================================================================

const FIRST_NAMES = [
  "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
  "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
  "Thomas", "Sarah", "Christopher", "Karen", "Charles", "Lisa", "Daniel", "Nancy",
  "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley",
  "Steven", "Dorothy", "Paul", "Kimberly", "Andrew", "Emily", "Joshua", "Donna",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
];

const STREETS = [
  "Main St", "Oak Ave", "Elm St", "Park Dr", "Cedar Ln", "Maple Ave", "Pine St",
  "Washington Blvd", "Lake Dr", "Hill Rd", "Forest Ave", "River Rd", "Spring St",
  "Valley View Dr", "Sunset Blvd", "Highland Ave", "Meadow Ln", "Walnut St",
];

const CITIES = [
  "New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia",
  "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville",
  "Fort Worth", "Columbus", "Charlotte", "Indianapolis", "San Francisco",
  "Seattle", "Denver", "Nashville", "Portland", "Memphis", "Louisville",
];

const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
];

const DOMAINS = [
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "example.com",
  "test.com", "mail.com", "proton.me", "icloud.com", "aol.com",
];

const LOREM_WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
  "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
  "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
  "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
  "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
  "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
  "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
  "deserunt", "mollit", "anim", "id", "est", "laborum",
];

const COMPANY_SUFFIXES = ["Inc", "LLC", "Corp", "Ltd", "Co", "Group", "Solutions", "Technologies"];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * FakeData provides simple deterministic-enough fake data generators
 * powered by Math.random() for use in mock responses and test data.
 */
export const FakeData = {
  /** Generate a random full name */
  name(): string {
    return `${randomItem(FIRST_NAMES)} ${randomItem(LAST_NAMES)}`;
  },

  /** Generate a random first name */
  firstName(): string {
    return randomItem(FIRST_NAMES);
  },

  /** Generate a random last name */
  lastName(): string {
    return randomItem(LAST_NAMES);
  },

  /** Generate a random email address */
  email(): string {
    const first = randomItem(FIRST_NAMES).toLowerCase();
    const last = randomItem(LAST_NAMES).toLowerCase();
    const domain = randomItem(DOMAINS);
    const num = Math.floor(Math.random() * 100);
    return `${first}.${last}${num}@${domain}`;
  },

  /** Generate a random US phone number */
  phone(): string {
    const area = Math.floor(Math.random() * 900) + 100;
    const prefix = Math.floor(Math.random() * 900) + 100;
    const line = Math.floor(Math.random() * 9000) + 1000;
    return `+1 (${area}) ${prefix}-${line}`;
  },

  /** Generate a random US address */
  address(): string {
    const number = Math.floor(Math.random() * 9000) + 100;
    const street = randomItem(STREETS);
    const city = randomItem(CITIES);
    const state = randomItem(STATES);
    const zip = String(Math.floor(Math.random() * 90000) + 10000);
    return `${number} ${street}, ${city}, ${state} ${zip}`;
  },

  /** Generate lorem ipsum text with n words */
  lorem(n: number = 20): string {
    const words: string[] = [];
    for (let i = 0; i < n; i++) {
      words.push(randomItem(LOREM_WORDS));
    }
    // Capitalize first word
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    return words.join(" ") + ".";
  },

  /** Generate a random paragraph */
  paragraph(): string {
    return FakeData.lorem(Math.floor(Math.random() * 40) + 20);
  },

  /** Generate a random number within a range */
  number(min: number = 0, max: number = 1000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /** Generate a random float within a range */
  float(min: number = 0, max: number = 1, decimals: number = 2): number {
    const value = Math.random() * (max - min) + min;
    return parseFloat(value.toFixed(decimals));
  },

  /** Generate a random boolean */
  boolean(): boolean {
    return Math.random() < 0.5;
  },

  /** Generate a random date within the past year */
  date(): Date {
    const now = Date.now();
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    return new Date(now - Math.floor(Math.random() * oneYear));
  },

  /** Generate a random date string (ISO format) */
  dateString(): string {
    return FakeData.date().toISOString();
  },

  /** Generate a random past date string */
  pastDate(years: number = 5): string {
    const now = Date.now();
    const ms = years * 365 * 24 * 60 * 60 * 1000;
    return new Date(now - Math.floor(Math.random() * ms)).toISOString();
  },

  /** Generate a random future date string */
  futureDate(years: number = 1): string {
    const now = Date.now();
    const ms = years * 365 * 24 * 60 * 60 * 1000;
    return new Date(now + Math.floor(Math.random() * ms)).toISOString();
  },

  /** Generate a random UUID v4 */
  uuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  /** Generate a random URL */
  url(): string {
    const protocols = ["https"];
    const tlds = ["com", "org", "io", "dev", "net"];
    const words = ["app", "api", "web", "cloud", "data", "code", "dev", "hub"];
    const protocol = randomItem(protocols);
    const subdomain = randomItem(words);
    const domain = randomItem(words);
    const tld = randomItem(tlds);
    return `${protocol}://${subdomain}.${domain}.${tld}`;
  },

  /** Generate a random image URL (placeholder) */
  imageUrl(width: number = 640, height: number = 480): string {
    return `https://picsum.photos/${width}/${height}?random=${Math.floor(Math.random() * 10000)}`;
  },

  /** Generate a random avatar URL */
  avatarUrl(): string {
    const id = Math.floor(Math.random() * 70);
    return `https://i.pravatar.cc/150?img=${id}`;
  },

  /** Generate a random company name */
  company(): string {
    return `${randomItem(LAST_NAMES)} ${randomItem(COMPANY_SUFFIXES)}`;
  },

  /** Generate a random hex color */
  color(): string {
    return "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
  },

  /** Generate a random IP address */
  ip(): string {
    const octets = Array.from({ length: 4 }, () => Math.floor(Math.random() * 256));
    return octets.join(".");
  },

  /** Generate a random user agent string */
  userAgent(): string {
    const browsers = ["Chrome/120.0", "Firefox/121.0", "Safari/17.2", "Edge/120.0"];
    return `Mozilla/5.0 (compatible; ${randomItem(browsers)})`;
  },

  /** Generate a random hexadecimal string of given length */
  hex(length: number = 16): string {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += Math.floor(Math.random() * 16).toString(16);
    }
    return result;
  },

  /** Generate a random alphanumeric string */
  alphanumeric(length: number = 8): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  },

  /** Pick a random item from an array */
  pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  },

  /** Generate an array of fake items */
  array<T>(generator: () => T, count: number = 5): T[] {
    return Array.from({ length: count }, generator);
  },
};
