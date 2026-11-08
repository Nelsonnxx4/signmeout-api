import { randomInt } from "node:crypto";

// No i, l, o, 0, 1: avoids lookalikes when a link is read aloud or typed.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const LENGTH = 10; // 31^10 ≈ 8e14 combinations: not guessable, short enough to share
export const SLUG_PATTERN = /^[abcdefghjkmnpqrstuvwxyz2-9]{10}$/;

export function generateSlug(): string {
	let out = "";
	for (let i = 0; i < LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
	return out;
}
