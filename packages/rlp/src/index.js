/**
 * Built on top of rlp library, removing the BN dependency for the flow.
 * Package : https://github.com/ethereumjs/rlp
 * RLP License : https://github.com/ethereumjs/rlp/blob/master/LICENSE
 *
 * ethereumjs/rlp is licensed under the
 * Mozilla Public License 2.0
 * Permissions of this weak copyleft license are conditioned on making available source code of licensed files and modifications of those files under the same license (or in certain cases, one of the GNU licenses). Copyright and license notices must be preserved. Contributors provide an express grant of patent rights. However, a larger work using the licensed work may be distributed under different terms and without source code for files added in the larger work.
 **/

/**
 * @param input - will be converted to buffer
 * @returns returns buffer of encoded data
 **/
export function encode(input) {
  if (Array.isArray(input)) {
    var output = []
    for (var i = 0; i < input.length; i++) {
      output.push(encode(input[i]))
    }
    var buf = Buffer.concat(output)
    return Buffer.concat([encodeLength(buf.length, 192), buf])
  } else {
    var inputBuf = toBuffer(input)
    return inputBuf.length === 1 && inputBuf[0] < 128
      ? inputBuf
      : Buffer.concat([encodeLength(inputBuf.length, 128), inputBuf])
  }
}

/**
 * Parse integers. Check if there is no leading zeros
 * @param v The value to parse
 * @param base The base to parse the integer into
 */
function safeParseInt(v, base) {
  if (v.slice(0, 2) === "00") {
    throw new Error("invalid RLP: extra zeros")
  }
  return parseInt(v, base)
}
function encodeLength(len, offset) {
  if (len < 56) {
    return Buffer.from([len + offset])
  } else {
    var hexLength = intToHex(len)
    var lLength = hexLength.length / 2
    var firstByte = intToHex(offset + 55 + lLength)
    return Buffer.from(firstByte + hexLength, "hex")
  }
}

function decode(input, stream) {
  if (stream === void 0) {
    stream = false
  }
  if (!input || input.length === 0) {
    return Buffer.from([])
  }
  var inputBuffer = toBuffer(input)
  var decoded = _decode(inputBuffer)
  if (stream) {
    return decoded
  }
  if (decoded.remainder.length !== 0) {
    throw new Error("invalid remainder")
  }
  return decoded.data
}

/**
 * Get the length of the RLP input
 * @param input
 * @returns The length of the input or an empty Buffer if no input
 */
export function getLength(input) {
  if (!input || input.length === 0) {
    return Buffer.from([])
  }
  var inputBuffer = toBuffer(input)
  var firstByte = inputBuffer[0]
  if (firstByte <= 0x7f) {
    return inputBuffer.length
  } else if (firstByte <= 0xb7) {
    return firstByte - 0x7f
  } else if (firstByte <= 0xbf) {
    return firstByte - 0xb6
  } else if (firstByte <= 0xf7) {
    // a list between  0-55 bytes long
    return firstByte - 0xbf
  } else {
    // a list  over 55 bytes long
    var llength = firstByte - 0xf6
    var length = safeParseInt(inputBuffer.slice(1, llength).toString("hex"), 16)
    return llength + length
  }
}

/** Decode an input with RLP */
function _decode(input) {
  var length, llength, data, innerRemainder, d
  var decoded = []
  var firstByte = input[0]
  if (firstByte <= 0x7f) {
    // a single byte whose value is in the [0x00, 0x7f] range, that byte is its own RLP encoding.
    return {
      data: input.slice(0, 1),
      remainder: input.slice(1),
    }
  } else if (firstByte <= 0xb7) {
    // string is 0-55 bytes long. A single byte with value 0x80 plus the length of the string followed by the string
    // The range of the first byte is [0x80, 0xb7]
    length = firstByte - 0x7f
    // set 0x80 null to 0
    if (firstByte === 0x80) {
      data = Buffer.from([])
    } else {
      data = input.slice(1, length)
    }
    if (length === 2 && data[0] < 0x80) {
      throw new Error("invalid rlp encoding: byte must be less 0x80")
    }
    return {
      data: data,
      remainder: input.slice(length),
    }
  } else if (firstByte <= 0xbf) {
    llength = firstByte - 0xb6
    length = safeParseInt(input.slice(1, llength).toString("hex"), 16)
    data = input.slice(llength, length + llength)
    if (data.length < length) {
      throw new Error("invalid RLP")
    }
    return {
      data: data,
      remainder: input.slice(length + llength),
    }
  } else if (firstByte <= 0xf7) {
    // a list between  0-55 bytes long
    length = firstByte - 0xbf
    innerRemainder = input.slice(1, length)
    while (innerRemainder.length) {
      d = _decode(innerRemainder)
      decoded.push(d.data)
      innerRemainder = d.remainder
    }
    return {
      data: decoded,
      remainder: input.slice(length),
    }
  } else {
    // a list  over 55 bytes long
    llength = firstByte - 0xf6
    length = safeParseInt(input.slice(1, llength).toString("hex"), 16)
    var totalLength = llength + length
    if (totalLength > input.length) {
      throw new Error("invalid rlp: total length is larger than the data")
    }
    innerRemainder = input.slice(llength, totalLength)
    if (innerRemainder.length === 0) {
      throw new Error("invalid rlp, List has a invalid length")
    }
    while (innerRemainder.length) {
      d = _decode(innerRemainder)
      decoded.push(d.data)
      innerRemainder = d.remainder
    }
    return {
      data: decoded,
      remainder: input.slice(totalLength),
    }
  }
}
/** Check if a string is prefixed by 0x */
function isHexPrefixed(str) {
  return str.slice(0, 2) === "0x"
}
/** Removes 0x from a given String */
function stripHexPrefix(str) {
  if (typeof str !== "string") {
    return str
  }
  return isHexPrefixed(str) ? str.slice(2) : str
}
/** Transform an integer into its hexadecimal value */
function intToHex(integer) {
  if (integer < 0) {
    throw new Error("Invalid integer as argument, must be unsigned!")
  }
  var hex = integer.toString(16)
  return hex.length % 2 ? "0" + hex : hex
}
/** Pad a string to be even */
function padToEven(a) {
  return a.length % 2 ? "0" + a : a
}
/** Transform an integer into a Buffer */
function intToBuffer(integer) {
  var hex = intToHex(integer)
  return Buffer.from(hex, "hex")
}

/** Transform anything into a Buffer */
export function toBuffer(v) {
  if (!Buffer.isBuffer(v)) {
    if (typeof v === "string") {
      if (isHexPrefixed(v)) {
        return Buffer.from(padToEven(stripHexPrefix(v)), "hex")
      } else {
        return Buffer.from(v)
      }
    } else if (typeof v === "number") {
      if (!v) {
        return Buffer.from([])
      } else {
        return intToBuffer(v)
      }
    } else if (v === null || v === undefined) {
      return Buffer.from([])
    } else if (v instanceof Uint8Array) {
      return Buffer.from(v)
    } else {
      throw new Error("invalid type")
    }
  }
  return v
}
