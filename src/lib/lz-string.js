/*
 * Adapted from lz-string.
 * Copyright (c) 2013 Pieroxy <pieroxy@pieroxy.net>
 * SPDX-License-Identifier: MIT
 * See THIRD_PARTY_NOTICES.md for the complete license text.
 */

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const reverseDictionary = new Map([...BASE64_ALPHABET].map((character, index) => [character, index]));

export function decompressFromBase64(input) {
  if (input == null) return "";
  if (input === "") return null;
  return decompress(input.length, 32, (index) => reverseDictionary.get(input.charAt(index)) ?? 0);
}

function decompress(length, resetValue, getNextValue) {
  const dictionary = [];
  const data = { value: getNextValue(0), position: resetValue, index: 1 };
  let enlargeIn = 4;
  let dictionarySize = 4;
  let numberOfBits = 3;
  let entry = "";
  const result = [];

  for (let i = 0; i < 3; i += 1) dictionary[i] = i;

  let next = readBits(2, data, length, resetValue, getNextValue);
  let character;
  if (next === 0) {
    character = String.fromCharCode(readBits(8, data, length, resetValue, getNextValue));
  } else if (next === 1) {
    character = String.fromCharCode(readBits(16, data, length, resetValue, getNextValue));
  } else {
    return "";
  }

  dictionary[3] = character;
  let previous = character;
  result.push(character);

  while (true) {
    if (data.index > length) return "";

    let code = readBits(numberOfBits, data, length, resetValue, getNextValue);
    if (code === 0) {
      dictionary[dictionarySize] = String.fromCharCode(
        readBits(8, data, length, resetValue, getNextValue),
      );
      code = dictionarySize;
      dictionarySize += 1;
      enlargeIn -= 1;
    } else if (code === 1) {
      dictionary[dictionarySize] = String.fromCharCode(
        readBits(16, data, length, resetValue, getNextValue),
      );
      code = dictionarySize;
      dictionarySize += 1;
      enlargeIn -= 1;
    } else if (code === 2) {
      return result.join("");
    }

    if (enlargeIn === 0) {
      enlargeIn = 2 ** numberOfBits;
      numberOfBits += 1;
    }

    if (dictionary[code] !== undefined) {
      entry = dictionary[code];
    } else if (code === dictionarySize) {
      entry = previous + previous.charAt(0);
    } else {
      return null;
    }

    result.push(entry);
    dictionary[dictionarySize] = previous + entry.charAt(0);
    dictionarySize += 1;
    enlargeIn -= 1;
    previous = entry;

    if (enlargeIn === 0) {
      enlargeIn = 2 ** numberOfBits;
      numberOfBits += 1;
    }
  }
}

function readBits(count, data, length, resetValue, getNextValue) {
  let bits = 0;
  let power = 1;
  const maxPower = 2 ** count;

  while (power !== maxPower) {
    const bit = data.value & data.position;
    data.position >>= 1;
    if (data.position === 0) {
      data.position = resetValue;
      data.value = getNextValue(data.index);
      data.index += 1;
    }
    if (bit > 0) bits |= power;
    power <<= 1;
  }

  return bits;
}
