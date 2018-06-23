// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// {{PRE_JSES}}

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function(status, toThrow) {
  throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('Module[\'ENVIRONMENT\'] value is not valid. must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    var ret;
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      ret = nodeFS['readFileSync'](filename);
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  if (process['argv'].length > 1) {
    Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });
  // Currently node will swallow unhandled rejections, but this behavior is
  // deprecated, and in the future it will exit with error status.
  process['on']('unhandledRejection', function(reason, p) {
    Module['printErr']('node.js exiting due to unhandled promise rejection');
    process['exit'](1);
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (typeof read != 'undefined') {
    Module['read'] = function shell_read(f) {
      return read(f);
    };
  }

  Module['readBinary'] = function readBinary(f) {
    var data;
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }
}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function shell_read(url) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(xhr.response);
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  Module['setWindowTitle'] = function(title) { document.title = title };
}
else {
  // Unreachable because SHELL is dependent on the others
  throw new Error('unknown runtime environment');
}

// console.log is checked first, as 'print' on the web will open a print dialogue
// printErr is preferable to console.warn (works better in shells)
// bind(console) is necessary to fix IE/Edge closed dev tools panel behavior.
Module['print'] = typeof console !== 'undefined' ? console.log.bind(console) : (typeof print !== 'undefined' ? print : null);
Module['printErr'] = typeof printErr !== 'undefined' ? printErr : ((typeof console !== 'undefined' && console.warn.bind(console)) || Module['print']);

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;

// stack management, and other functionality that is provided by the compiled code,
// should not be used before it is ready
stackSave = stackRestore = stackAlloc = setTempRet0 = getTempRet0 = function() {
  abort('cannot use the stack before compiled code is ready to run, and has provided stack access');
};

function staticAlloc(size) {
  assert(!staticSealed);
  var ret = STATICTOP;
  STATICTOP = (STATICTOP + size + 15) & -16;
  return ret;
}

function dynamicAlloc(size) {
  assert(DYNAMICTOP_PTR);
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  HEAP32[DYNAMICTOP_PTR>>2] = end;
  if (end >= TOTAL_MEMORY) {
    var success = enlargeMemory();
    if (!success) {
      HEAP32[DYNAMICTOP_PTR>>2] = ret;
      return 0;
    }
  }
  return ret;
}

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  var ret = size = Math.ceil(size / factor) * factor;
  return ret;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 === 0);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    Module.printErr(text);
  }
}



var jsCallStartIndex = 1;
var functionPointers = new Array(0);

// 'sig' parameter is only used on LLVM wasm backend
function addFunction(func, sig) {
  if (typeof sig === 'undefined') {
    Module.printErr('Warning: addFunction: Provide a wasm function signature ' +
                    'string as a second argument');
  }
  var base = 0;
  for (var i = base; i < base + 0; i++) {
    if (!functionPointers[i]) {
      functionPointers[i] = func;
      return jsCallStartIndex + i;
    }
  }
  throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
}

function removeFunction(index) {
  functionPointers[index-jsCallStartIndex] = null;
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    assert(args.length == sig.length-1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    assert(sig.length == 1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].call(null, ptr);
  }
}


function getCompilerSetting(name) {
  throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for getCompilerSetting or emscripten_get_compiler_setting to work';
}

var Runtime = {
  // FIXME backwards compatibility layer for ports. Support some Runtime.*
  //       for now, fix it there, then remove it from here. That way we
  //       can minimize any period of breakage.
  dynCall: dynCall, // for SDL2 port
  // helpful errors
  getTempRet0: function() { abort('getTempRet0() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  staticAlloc: function() { abort('staticAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  stackAlloc: function() { abort('stackAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 8;



// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

var JSfuncs = {
  // Helpers for cwrap -- it can't refer to Runtime directly because it might
  // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
  // out what the minified function name is.
  'stackSave': function() {
    stackSave()
  },
  'stackRestore': function() {
    stackRestore()
  },
  // type conversion from js to c
  'arrayToC' : function(arr) {
    var ret = stackAlloc(arr.length);
    writeArrayToMemory(arr, ret);
    return ret;
  },
  'stringToC' : function(str) {
    var ret = 0;
    if (str !== null && str !== undefined && str !== 0) { // null string
      // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
      var len = (str.length << 2) + 1;
      ret = stackAlloc(len);
      stringToUTF8(str, ret, len);
    }
    return ret;
  }
};
// For fast lookup of conversion functions
var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

// C calling interface.
function ccall (ident, returnType, argTypes, args, opts) {
  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  if (returnType === 'string') ret = Pointer_stringify(ret);
  if (stack !== 0) {
    stackRestore(stack);
  }
  return ret;
}

function cwrap (ident, returnType, argTypes) {
  argTypes = argTypes || [];
  var cfunc = getCFunc(ident);
  // When the function takes numbers and returns a number, we can just return
  // the original function
  var numericArgs = argTypes.every(function(type){ return type === 'number'});
  var numericRet = returnType !== 'string';
  if (numericRet && numericArgs) {
    return cfunc;
  }
  return function() {
    return ccall(ident, returnType, argTypes, arguments);
  }
}

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= (+1) ? (tempDouble > (+0) ? ((Math_min((+(Math_floor((tempDouble)/(+4294967296)))), (+4294967295)))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/(+4294967296))))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : staticAlloc, stackAlloc, staticAlloc, dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return staticAlloc(size);
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}

/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return UTF8ToString(ptr);
}

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

function demangle(func) {
  warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
  Module['buffer'] = buffer;
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}

assert(Math['imul'] && Math['fround'] && Math['clz32'] && Math['trunc'], 'this is a legacy browser, build with LEGACY_VM_SUPPORT');

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;



// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}





// === Body ===

var ASM_CONSTS = [function() { return Date.now(); },
 function($0, $1) { MbedJSHal.gpio.write($0, $1); },
 function($0, $1) { MbedJSHal.gpio.init_out($0, $1, 0); }];

function _emscripten_asm_const_iii(code, a0, a1) {
  return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_i(code) {
  return ASM_CONSTS[code]();
}




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 5632;
/* global initializers */  __ATINIT__.push();


memoryInitializer = "trace.js.mem";





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  function ___lock() {}

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  function flush_NO_FILESYSTEM() {
      // flush anything remaining in the buffers during shutdown
      var fflush = Module["_fflush"];
      if (fflush) fflush(0);
      var printChar = ___syscall146.printChar;
      if (!printChar) return;
      var buffers = ___syscall146.buffers;
      if (buffers[1].length) printChar(1, 10);
      if (buffers[2].length) printChar(2, 10);
    }function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffers) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
   
  
   
  
  var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC);   

  function ___unlock() {}

   

  function _abort() {
      Module['abort']();
    }

   

   

  
  var ___async_cur_frame=0; 

  var _emscripten_asm_const_int=true;

   

   

  
  
  var ___async=0;
  
  var ___async_unwind=1;
  
  var ___async_retval=STATICTOP; STATICTOP += 16;; 
  
  
  
  function _emscripten_set_main_loop_timing(mode, value) {
      Browser.mainLoop.timingMode = mode;
      Browser.mainLoop.timingValue = value;
  
      if (!Browser.mainLoop.func) {
        console.error('emscripten_set_main_loop_timing: Cannot set timing mode for main loop since a main loop does not exist! Call emscripten_set_main_loop first to set one up.');
        return 1; // Return non-zero on failure, can't set timing mode when there is no main loop.
      }
  
      if (mode == 0 /*EM_TIMING_SETTIMEOUT*/) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
          var timeUntilNextTick = Math.max(0, Browser.mainLoop.tickStartTime + value - _emscripten_get_now())|0;
          setTimeout(Browser.mainLoop.runner, timeUntilNextTick); // doing this each time means that on exception, we stop
        };
        Browser.mainLoop.method = 'timeout';
      } else if (mode == 1 /*EM_TIMING_RAF*/) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
          Browser.requestAnimationFrame(Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = 'rAF';
      } else if (mode == 2 /*EM_TIMING_SETIMMEDIATE*/) {
        if (typeof setImmediate === 'undefined') {
          // Emulate setImmediate. (note: not a complete polyfill, we don't emulate clearImmediate() to keep code size to minimum, since not needed)
          var setImmediates = [];
          var emscriptenMainLoopMessageId = 'setimmediate';
          function Browser_setImmediate_messageHandler(event) {
            // When called in current thread or Worker, the main loop ID is structured slightly different to accommodate for --proxy-to-worker runtime listening to Worker events,
            // so check for both cases.
            if (event.data === emscriptenMainLoopMessageId || event.data.target === emscriptenMainLoopMessageId) {
              event.stopPropagation();
              setImmediates.shift()();
            }
          }
          addEventListener("message", Browser_setImmediate_messageHandler, true);
          setImmediate = function Browser_emulated_setImmediate(func) {
            setImmediates.push(func);
            if (ENVIRONMENT_IS_WORKER) {
              if (Module['setImmediates'] === undefined) Module['setImmediates'] = [];
              Module['setImmediates'].push(func);
              postMessage({target: emscriptenMainLoopMessageId}); // In --proxy-to-worker, route the message via proxyClient.js
            } else postMessage(emscriptenMainLoopMessageId, "*"); // On the main thread, can just send the message to itself.
          }
        }
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
          setImmediate(Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = 'immediate';
      }
      return 0;
    }
  
  function _emscripten_get_now() { abort() }function _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg, noSetTiming) {
      Module['noExitRuntime'] = true;
  
      assert(!Browser.mainLoop.func, 'emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.');
  
      Browser.mainLoop.func = func;
      Browser.mainLoop.arg = arg;
  
      var browserIterationFunc;
      if (typeof arg !== 'undefined') {
        browserIterationFunc = function() {
          Module['dynCall_vi'](func, arg);
        };
      } else {
        browserIterationFunc = function() {
          Module['dynCall_v'](func);
        };
      }
  
      var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
  
      Browser.mainLoop.runner = function Browser_mainLoop_runner() {
        if (ABORT) return;
        if (Browser.mainLoop.queue.length > 0) {
          var start = Date.now();
          var blocker = Browser.mainLoop.queue.shift();
          blocker.func(blocker.arg);
          if (Browser.mainLoop.remainingBlockers) {
            var remaining = Browser.mainLoop.remainingBlockers;
            var next = remaining%1 == 0 ? remaining-1 : Math.floor(remaining);
            if (blocker.counted) {
              Browser.mainLoop.remainingBlockers = next;
            } else {
              // not counted, but move the progress along a tiny bit
              next = next + 0.5; // do not steal all the next one's progress
              Browser.mainLoop.remainingBlockers = (8*remaining + next)/9;
            }
          }
          console.log('main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + ' ms'); //, left: ' + Browser.mainLoop.remainingBlockers);
          Browser.mainLoop.updateStatus();
          
          // catches pause/resume main loop from blocker execution
          if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
          
          setTimeout(Browser.mainLoop.runner, 0);
          return;
        }
  
        // catch pauses from non-main loop sources
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
  
        // Implement very basic swap interval control
        Browser.mainLoop.currentFrameNumber = Browser.mainLoop.currentFrameNumber + 1 | 0;
        if (Browser.mainLoop.timingMode == 1/*EM_TIMING_RAF*/ && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
          // Not the scheduled time to render this frame - skip.
          Browser.mainLoop.scheduler();
          return;
        } else if (Browser.mainLoop.timingMode == 0/*EM_TIMING_SETTIMEOUT*/) {
          Browser.mainLoop.tickStartTime = _emscripten_get_now();
        }
  
        // Signal GL rendering layer that processing of a new frame is about to start. This helps it optimize
        // VBO double-buffering and reduce GPU stalls.
  
  
        if (Browser.mainLoop.method === 'timeout' && Module.ctx) {
          Module.printErr('Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!');
          Browser.mainLoop.method = ''; // just warn once per call to set main loop
        }
  
        Browser.mainLoop.runIter(browserIterationFunc);
  
        checkStackCookie();
  
        // catch pauses from the main loop itself
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
  
        // Queue new audio data. This is important to be right after the main loop invocation, so that we will immediately be able
        // to queue the newest produced audio samples.
        // TODO: Consider adding pre- and post- rAF callbacks so that GL.newRenderingFrameStarted() and SDL.audio.queueNewAudioData()
        //       do not need to be hardcoded into this function, but can be more generic.
        if (typeof SDL === 'object' && SDL.audio && SDL.audio.queueNewAudioData) SDL.audio.queueNewAudioData();
  
        Browser.mainLoop.scheduler();
      }
  
      if (!noSetTiming) {
        if (fps && fps > 0) _emscripten_set_main_loop_timing(0/*EM_TIMING_SETTIMEOUT*/, 1000.0 / fps);
        else _emscripten_set_main_loop_timing(1/*EM_TIMING_RAF*/, 1); // Do rAF by rendering each frame (no decimating)
  
        Browser.mainLoop.scheduler();
      }
  
      if (simulateInfiniteLoop) {
        throw 'SimulateInfiniteLoop';
      }
    }var Browser={mainLoop:{scheduler:null,method:"",currentlyRunningMainloop:0,func:null,arg:0,timingMode:0,timingValue:0,currentFrameNumber:0,queue:[],pause:function () {
          Browser.mainLoop.scheduler = null;
          Browser.mainLoop.currentlyRunningMainloop++; // Incrementing this signals the previous main loop that it's now become old, and it must return.
        },resume:function () {
          Browser.mainLoop.currentlyRunningMainloop++;
          var timingMode = Browser.mainLoop.timingMode;
          var timingValue = Browser.mainLoop.timingValue;
          var func = Browser.mainLoop.func;
          Browser.mainLoop.func = null;
          _emscripten_set_main_loop(func, 0, false, Browser.mainLoop.arg, true /* do not set timing and call scheduler, we will do it on the next lines */);
          _emscripten_set_main_loop_timing(timingMode, timingValue);
          Browser.mainLoop.scheduler();
        },updateStatus:function () {
          if (Module['setStatus']) {
            var message = Module['statusMessage'] || 'Please wait...';
            var remaining = Browser.mainLoop.remainingBlockers;
            var expected = Browser.mainLoop.expectedBlockers;
            if (remaining) {
              if (remaining < expected) {
                Module['setStatus'](message + ' (' + (expected - remaining) + '/' + expected + ')');
              } else {
                Module['setStatus'](message);
              }
            } else {
              Module['setStatus']('');
            }
          }
        },runIter:function (func) {
          if (ABORT) return;
          if (Module['preMainLoop']) {
            var preRet = Module['preMainLoop']();
            if (preRet === false) {
              return; // |return false| skips a frame
            }
          }
          try {
            func();
          } catch (e) {
            if (e instanceof ExitStatus) {
              return;
            } else {
              if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
              throw e;
            }
          }
          if (Module['postMainLoop']) Module['postMainLoop']();
        }},isFullscreen:false,pointerLock:false,moduleContextCreatedCallbacks:[],workers:[],init:function () {
        if (!Module["preloadPlugins"]) Module["preloadPlugins"] = []; // needs to exist even in workers
  
        if (Browser.initted) return;
        Browser.initted = true;
  
        try {
          new Blob();
          Browser.hasBlobConstructor = true;
        } catch(e) {
          Browser.hasBlobConstructor = false;
          console.log("warning: no blob constructor, cannot create blobs with mimetypes");
        }
        Browser.BlobBuilder = typeof MozBlobBuilder != "undefined" ? MozBlobBuilder : (typeof WebKitBlobBuilder != "undefined" ? WebKitBlobBuilder : (!Browser.hasBlobConstructor ? console.log("warning: no BlobBuilder") : null));
        Browser.URLObject = typeof window != "undefined" ? (window.URL ? window.URL : window.webkitURL) : undefined;
        if (!Module.noImageDecoding && typeof Browser.URLObject === 'undefined') {
          console.log("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.");
          Module.noImageDecoding = true;
        }
  
        // Support for plugins that can process preloaded files. You can add more of these to
        // your app by creating and appending to Module.preloadPlugins.
        //
        // Each plugin is asked if it can handle a file based on the file's name. If it can,
        // it is given the file's raw data. When it is done, it calls a callback with the file's
        // (possibly modified) data. For example, a plugin might decompress a file, or it
        // might create some side data structure for use later (like an Image element, etc.).
  
        var imagePlugin = {};
        imagePlugin['canHandle'] = function imagePlugin_canHandle(name) {
          return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
        };
        imagePlugin['handle'] = function imagePlugin_handle(byteArray, name, onload, onerror) {
          var b = null;
          if (Browser.hasBlobConstructor) {
            try {
              b = new Blob([byteArray], { type: Browser.getMimetype(name) });
              if (b.size !== byteArray.length) { // Safari bug #118630
                // Safari's Blob can only take an ArrayBuffer
                b = new Blob([(new Uint8Array(byteArray)).buffer], { type: Browser.getMimetype(name) });
              }
            } catch(e) {
              warnOnce('Blob constructor present but fails: ' + e + '; falling back to blob builder');
            }
          }
          if (!b) {
            var bb = new Browser.BlobBuilder();
            bb.append((new Uint8Array(byteArray)).buffer); // we need to pass a buffer, and must copy the array to get the right data range
            b = bb.getBlob();
          }
          var url = Browser.URLObject.createObjectURL(b);
          assert(typeof url == 'string', 'createObjectURL must return a url as a string');
          var img = new Image();
          img.onload = function img_onload() {
            assert(img.complete, 'Image ' + name + ' could not be decoded');
            var canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            Module["preloadedImages"][name] = canvas;
            Browser.URLObject.revokeObjectURL(url);
            if (onload) onload(byteArray);
          };
          img.onerror = function img_onerror(event) {
            console.log('Image ' + url + ' could not be decoded');
            if (onerror) onerror();
          };
          img.src = url;
        };
        Module['preloadPlugins'].push(imagePlugin);
  
        var audioPlugin = {};
        audioPlugin['canHandle'] = function audioPlugin_canHandle(name) {
          return !Module.noAudioDecoding && name.substr(-4) in { '.ogg': 1, '.wav': 1, '.mp3': 1 };
        };
        audioPlugin['handle'] = function audioPlugin_handle(byteArray, name, onload, onerror) {
          var done = false;
          function finish(audio) {
            if (done) return;
            done = true;
            Module["preloadedAudios"][name] = audio;
            if (onload) onload(byteArray);
          }
          function fail() {
            if (done) return;
            done = true;
            Module["preloadedAudios"][name] = new Audio(); // empty shim
            if (onerror) onerror();
          }
          if (Browser.hasBlobConstructor) {
            try {
              var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
            } catch(e) {
              return fail();
            }
            var url = Browser.URLObject.createObjectURL(b); // XXX we never revoke this!
            assert(typeof url == 'string', 'createObjectURL must return a url as a string');
            var audio = new Audio();
            audio.addEventListener('canplaythrough', function() { finish(audio) }, false); // use addEventListener due to chromium bug 124926
            audio.onerror = function audio_onerror(event) {
              if (done) return;
              console.log('warning: browser could not fully decode audio ' + name + ', trying slower base64 approach');
              function encode64(data) {
                var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                var PAD = '=';
                var ret = '';
                var leftchar = 0;
                var leftbits = 0;
                for (var i = 0; i < data.length; i++) {
                  leftchar = (leftchar << 8) | data[i];
                  leftbits += 8;
                  while (leftbits >= 6) {
                    var curr = (leftchar >> (leftbits-6)) & 0x3f;
                    leftbits -= 6;
                    ret += BASE[curr];
                  }
                }
                if (leftbits == 2) {
                  ret += BASE[(leftchar&3) << 4];
                  ret += PAD + PAD;
                } else if (leftbits == 4) {
                  ret += BASE[(leftchar&0xf) << 2];
                  ret += PAD;
                }
                return ret;
              }
              audio.src = 'data:audio/x-' + name.substr(-3) + ';base64,' + encode64(byteArray);
              finish(audio); // we don't wait for confirmation this worked - but it's worth trying
            };
            audio.src = url;
            // workaround for chrome bug 124926 - we do not always get oncanplaythrough or onerror
            Browser.safeSetTimeout(function() {
              finish(audio); // try to use it even though it is not necessarily ready to play
            }, 10000);
          } else {
            return fail();
          }
        };
        Module['preloadPlugins'].push(audioPlugin);
  
        // Canvas event setup
  
        function pointerLockChange() {
          Browser.pointerLock = document['pointerLockElement'] === Module['canvas'] ||
                                document['mozPointerLockElement'] === Module['canvas'] ||
                                document['webkitPointerLockElement'] === Module['canvas'] ||
                                document['msPointerLockElement'] === Module['canvas'];
        }
        var canvas = Module['canvas'];
        if (canvas) {
          // forced aspect ratio can be enabled by defining 'forcedAspectRatio' on Module
          // Module['forcedAspectRatio'] = 4 / 3;
          
          canvas.requestPointerLock = canvas['requestPointerLock'] ||
                                      canvas['mozRequestPointerLock'] ||
                                      canvas['webkitRequestPointerLock'] ||
                                      canvas['msRequestPointerLock'] ||
                                      function(){};
          canvas.exitPointerLock = document['exitPointerLock'] ||
                                   document['mozExitPointerLock'] ||
                                   document['webkitExitPointerLock'] ||
                                   document['msExitPointerLock'] ||
                                   function(){}; // no-op if function does not exist
          canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
  
          document.addEventListener('pointerlockchange', pointerLockChange, false);
          document.addEventListener('mozpointerlockchange', pointerLockChange, false);
          document.addEventListener('webkitpointerlockchange', pointerLockChange, false);
          document.addEventListener('mspointerlockchange', pointerLockChange, false);
  
          if (Module['elementPointerLock']) {
            canvas.addEventListener("click", function(ev) {
              if (!Browser.pointerLock && Module['canvas'].requestPointerLock) {
                Module['canvas'].requestPointerLock();
                ev.preventDefault();
              }
            }, false);
          }
        }
      },createContext:function (canvas, useWebGL, setInModule, webGLContextAttributes) {
        if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx; // no need to recreate GL context if it's already been created for this canvas.
  
        var ctx;
        var contextHandle;
        if (useWebGL) {
          // For GLES2/desktop GL compatibility, adjust a few defaults to be different to WebGL defaults, so that they align better with the desktop defaults.
          var contextAttributes = {
            antialias: false,
            alpha: false
          };
  
          if (webGLContextAttributes) {
            for (var attribute in webGLContextAttributes) {
              contextAttributes[attribute] = webGLContextAttributes[attribute];
            }
          }
  
          contextHandle = GL.createContext(canvas, contextAttributes);
          if (contextHandle) {
            ctx = GL.getContext(contextHandle).GLctx;
          }
        } else {
          ctx = canvas.getContext('2d');
        }
  
        if (!ctx) return null;
  
        if (setInModule) {
          if (!useWebGL) assert(typeof GLctx === 'undefined', 'cannot set in module if GLctx is used, but we are a non-GL context that would replace it');
  
          Module.ctx = ctx;
          if (useWebGL) GL.makeContextCurrent(contextHandle);
          Module.useWebGL = useWebGL;
          Browser.moduleContextCreatedCallbacks.forEach(function(callback) { callback() });
          Browser.init();
        }
        return ctx;
      },destroyContext:function (canvas, useWebGL, setInModule) {},fullscreenHandlersInstalled:false,lockPointer:undefined,resizeCanvas:undefined,requestFullscreen:function (lockPointer, resizeCanvas, vrDevice) {
        Browser.lockPointer = lockPointer;
        Browser.resizeCanvas = resizeCanvas;
        Browser.vrDevice = vrDevice;
        if (typeof Browser.lockPointer === 'undefined') Browser.lockPointer = true;
        if (typeof Browser.resizeCanvas === 'undefined') Browser.resizeCanvas = false;
        if (typeof Browser.vrDevice === 'undefined') Browser.vrDevice = null;
  
        var canvas = Module['canvas'];
        function fullscreenChange() {
          Browser.isFullscreen = false;
          var canvasContainer = canvas.parentNode;
          if ((document['fullscreenElement'] || document['mozFullScreenElement'] ||
               document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
               document['webkitCurrentFullScreenElement']) === canvasContainer) {
            canvas.exitFullscreen = document['exitFullscreen'] ||
                                    document['cancelFullScreen'] ||
                                    document['mozCancelFullScreen'] ||
                                    document['msExitFullscreen'] ||
                                    document['webkitCancelFullScreen'] ||
                                    function() {};
            canvas.exitFullscreen = canvas.exitFullscreen.bind(document);
            if (Browser.lockPointer) canvas.requestPointerLock();
            Browser.isFullscreen = true;
            if (Browser.resizeCanvas) Browser.setFullscreenCanvasSize();
          } else {
            
            // remove the full screen specific parent of the canvas again to restore the HTML structure from before going full screen
            canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
            canvasContainer.parentNode.removeChild(canvasContainer);
            
            if (Browser.resizeCanvas) Browser.setWindowedCanvasSize();
          }
          if (Module['onFullScreen']) Module['onFullScreen'](Browser.isFullscreen);
          if (Module['onFullscreen']) Module['onFullscreen'](Browser.isFullscreen);
          Browser.updateCanvasDimensions(canvas);
        }
  
        if (!Browser.fullscreenHandlersInstalled) {
          Browser.fullscreenHandlersInstalled = true;
          document.addEventListener('fullscreenchange', fullscreenChange, false);
          document.addEventListener('mozfullscreenchange', fullscreenChange, false);
          document.addEventListener('webkitfullscreenchange', fullscreenChange, false);
          document.addEventListener('MSFullscreenChange', fullscreenChange, false);
        }
  
        // create a new parent to ensure the canvas has no siblings. this allows browsers to optimize full screen performance when its parent is the full screen root
        var canvasContainer = document.createElement("div");
        canvas.parentNode.insertBefore(canvasContainer, canvas);
        canvasContainer.appendChild(canvas);
  
        // use parent of canvas as full screen root to allow aspect ratio correction (Firefox stretches the root to screen size)
        canvasContainer.requestFullscreen = canvasContainer['requestFullscreen'] ||
                                            canvasContainer['mozRequestFullScreen'] ||
                                            canvasContainer['msRequestFullscreen'] ||
                                           (canvasContainer['webkitRequestFullscreen'] ? function() { canvasContainer['webkitRequestFullscreen'](Element['ALLOW_KEYBOARD_INPUT']) } : null) ||
                                           (canvasContainer['webkitRequestFullScreen'] ? function() { canvasContainer['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT']) } : null);
  
        if (vrDevice) {
          canvasContainer.requestFullscreen({ vrDisplay: vrDevice });
        } else {
          canvasContainer.requestFullscreen();
        }
      },requestFullScreen:function (lockPointer, resizeCanvas, vrDevice) {
          Module.printErr('Browser.requestFullScreen() is deprecated. Please call Browser.requestFullscreen instead.');
          Browser.requestFullScreen = function(lockPointer, resizeCanvas, vrDevice) {
            return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
          }
          return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
      },nextRAF:0,fakeRequestAnimationFrame:function (func) {
        // try to keep 60fps between calls to here
        var now = Date.now();
        if (Browser.nextRAF === 0) {
          Browser.nextRAF = now + 1000/60;
        } else {
          while (now + 2 >= Browser.nextRAF) { // fudge a little, to avoid timer jitter causing us to do lots of delay:0
            Browser.nextRAF += 1000/60;
          }
        }
        var delay = Math.max(Browser.nextRAF - now, 0);
        setTimeout(func, delay);
      },requestAnimationFrame:function requestAnimationFrame(func) {
        if (typeof window === 'undefined') { // Provide fallback to setTimeout if window is undefined (e.g. in Node.js)
          Browser.fakeRequestAnimationFrame(func);
        } else {
          if (!window.requestAnimationFrame) {
            window.requestAnimationFrame = window['requestAnimationFrame'] ||
                                           window['mozRequestAnimationFrame'] ||
                                           window['webkitRequestAnimationFrame'] ||
                                           window['msRequestAnimationFrame'] ||
                                           window['oRequestAnimationFrame'] ||
                                           Browser.fakeRequestAnimationFrame;
          }
          window.requestAnimationFrame(func);
        }
      },safeCallback:function (func) {
        return function() {
          if (!ABORT) return func.apply(null, arguments);
        };
      },allowAsyncCallbacks:true,queuedAsyncCallbacks:[],pauseAsyncCallbacks:function () {
        Browser.allowAsyncCallbacks = false;
      },resumeAsyncCallbacks:function () { // marks future callbacks as ok to execute, and synchronously runs any remaining ones right now
        Browser.allowAsyncCallbacks = true;
        if (Browser.queuedAsyncCallbacks.length > 0) {
          var callbacks = Browser.queuedAsyncCallbacks;
          Browser.queuedAsyncCallbacks = [];
          callbacks.forEach(function(func) {
            func();
          });
        }
      },safeRequestAnimationFrame:function (func) {
        return Browser.requestAnimationFrame(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } else {
            Browser.queuedAsyncCallbacks.push(func);
          }
        });
      },safeSetTimeout:function (func, timeout) {
        Module['noExitRuntime'] = true;
        return setTimeout(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } else {
            Browser.queuedAsyncCallbacks.push(func);
          }
        }, timeout);
      },safeSetInterval:function (func, timeout) {
        Module['noExitRuntime'] = true;
        return setInterval(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } // drop it on the floor otherwise, next interval will kick in
        }, timeout);
      },getMimetype:function (name) {
        return {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'bmp': 'image/bmp',
          'ogg': 'audio/ogg',
          'wav': 'audio/wav',
          'mp3': 'audio/mpeg'
        }[name.substr(name.lastIndexOf('.')+1)];
      },getUserMedia:function (func) {
        if(!window.getUserMedia) {
          window.getUserMedia = navigator['getUserMedia'] ||
                                navigator['mozGetUserMedia'];
        }
        window.getUserMedia(func);
      },getMovementX:function (event) {
        return event['movementX'] ||
               event['mozMovementX'] ||
               event['webkitMovementX'] ||
               0;
      },getMovementY:function (event) {
        return event['movementY'] ||
               event['mozMovementY'] ||
               event['webkitMovementY'] ||
               0;
      },getMouseWheelDelta:function (event) {
        var delta = 0;
        switch (event.type) {
          case 'DOMMouseScroll': 
            delta = event.detail;
            break;
          case 'mousewheel': 
            delta = event.wheelDelta;
            break;
          case 'wheel': 
            delta = event['deltaY'];
            break;
          default:
            throw 'unrecognized mouse wheel event: ' + event.type;
        }
        return delta;
      },mouseX:0,mouseY:0,mouseMovementX:0,mouseMovementY:0,touches:{},lastTouches:{},calculateMouseEvent:function (event) { // event should be mousemove, mousedown or mouseup
        if (Browser.pointerLock) {
          // When the pointer is locked, calculate the coordinates
          // based on the movement of the mouse.
          // Workaround for Firefox bug 764498
          if (event.type != 'mousemove' &&
              ('mozMovementX' in event)) {
            Browser.mouseMovementX = Browser.mouseMovementY = 0;
          } else {
            Browser.mouseMovementX = Browser.getMovementX(event);
            Browser.mouseMovementY = Browser.getMovementY(event);
          }
          
          // check if SDL is available
          if (typeof SDL != "undefined") {
            Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
            Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
          } else {
            // just add the mouse delta to the current absolut mouse position
            // FIXME: ideally this should be clamped against the canvas size and zero
            Browser.mouseX += Browser.mouseMovementX;
            Browser.mouseY += Browser.mouseMovementY;
          }        
        } else {
          // Otherwise, calculate the movement based on the changes
          // in the coordinates.
          var rect = Module["canvas"].getBoundingClientRect();
          var cw = Module["canvas"].width;
          var ch = Module["canvas"].height;
  
          // Neither .scrollX or .pageXOffset are defined in a spec, but
          // we prefer .scrollX because it is currently in a spec draft.
          // (see: http://www.w3.org/TR/2013/WD-cssom-view-20131217/)
          var scrollX = ((typeof window.scrollX !== 'undefined') ? window.scrollX : window.pageXOffset);
          var scrollY = ((typeof window.scrollY !== 'undefined') ? window.scrollY : window.pageYOffset);
          // If this assert lands, it's likely because the browser doesn't support scrollX or pageXOffset
          // and we have no viable fallback.
          assert((typeof scrollX !== 'undefined') && (typeof scrollY !== 'undefined'), 'Unable to retrieve scroll position, mouse positions likely broken.');
  
          if (event.type === 'touchstart' || event.type === 'touchend' || event.type === 'touchmove') {
            var touch = event.touch;
            if (touch === undefined) {
              return; // the "touch" property is only defined in SDL
  
            }
            var adjustedX = touch.pageX - (scrollX + rect.left);
            var adjustedY = touch.pageY - (scrollY + rect.top);
  
            adjustedX = adjustedX * (cw / rect.width);
            adjustedY = adjustedY * (ch / rect.height);
  
            var coords = { x: adjustedX, y: adjustedY };
            
            if (event.type === 'touchstart') {
              Browser.lastTouches[touch.identifier] = coords;
              Browser.touches[touch.identifier] = coords;
            } else if (event.type === 'touchend' || event.type === 'touchmove') {
              var last = Browser.touches[touch.identifier];
              if (!last) last = coords;
              Browser.lastTouches[touch.identifier] = last;
              Browser.touches[touch.identifier] = coords;
            } 
            return;
          }
  
          var x = event.pageX - (scrollX + rect.left);
          var y = event.pageY - (scrollY + rect.top);
  
          // the canvas might be CSS-scaled compared to its backbuffer;
          // SDL-using content will want mouse coordinates in terms
          // of backbuffer units.
          x = x * (cw / rect.width);
          y = y * (ch / rect.height);
  
          Browser.mouseMovementX = x - Browser.mouseX;
          Browser.mouseMovementY = y - Browser.mouseY;
          Browser.mouseX = x;
          Browser.mouseY = y;
        }
      },asyncLoad:function (url, onload, onerror, noRunDep) {
        var dep = !noRunDep ? getUniqueRunDependency('al ' + url) : '';
        Module['readAsync'](url, function(arrayBuffer) {
          assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
          onload(new Uint8Array(arrayBuffer));
          if (dep) removeRunDependency(dep);
        }, function(event) {
          if (onerror) {
            onerror();
          } else {
            throw 'Loading data file "' + url + '" failed.';
          }
        });
        if (dep) addRunDependency(dep);
      },resizeListeners:[],updateResizeListeners:function () {
        var canvas = Module['canvas'];
        Browser.resizeListeners.forEach(function(listener) {
          listener(canvas.width, canvas.height);
        });
      },setCanvasSize:function (width, height, noUpdates) {
        var canvas = Module['canvas'];
        Browser.updateCanvasDimensions(canvas, width, height);
        if (!noUpdates) Browser.updateResizeListeners();
      },windowedWidth:0,windowedHeight:0,setFullscreenCanvasSize:function () {
        // check if SDL is available   
        if (typeof SDL != "undefined") {
          var flags = HEAPU32[((SDL.screen)>>2)];
          flags = flags | 0x00800000; // set SDL_FULLSCREEN flag
          HEAP32[((SDL.screen)>>2)]=flags
        }
        Browser.updateResizeListeners();
      },setWindowedCanvasSize:function () {
        // check if SDL is available       
        if (typeof SDL != "undefined") {
          var flags = HEAPU32[((SDL.screen)>>2)];
          flags = flags & ~0x00800000; // clear SDL_FULLSCREEN flag
          HEAP32[((SDL.screen)>>2)]=flags
        }
        Browser.updateResizeListeners();
      },updateCanvasDimensions:function (canvas, wNative, hNative) {
        if (wNative && hNative) {
          canvas.widthNative = wNative;
          canvas.heightNative = hNative;
        } else {
          wNative = canvas.widthNative;
          hNative = canvas.heightNative;
        }
        var w = wNative;
        var h = hNative;
        if (Module['forcedAspectRatio'] && Module['forcedAspectRatio'] > 0) {
          if (w/h < Module['forcedAspectRatio']) {
            w = Math.round(h * Module['forcedAspectRatio']);
          } else {
            h = Math.round(w / Module['forcedAspectRatio']);
          }
        }
        if (((document['fullscreenElement'] || document['mozFullScreenElement'] ||
             document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
             document['webkitCurrentFullScreenElement']) === canvas.parentNode) && (typeof screen != 'undefined')) {
           var factor = Math.min(screen.width / w, screen.height / h);
           w = Math.round(w * factor);
           h = Math.round(h * factor);
        }
        if (Browser.resizeCanvas) {
          if (canvas.width  != w) canvas.width  = w;
          if (canvas.height != h) canvas.height = h;
          if (typeof canvas.style != 'undefined') {
            canvas.style.removeProperty( "width");
            canvas.style.removeProperty("height");
          }
        } else {
          if (canvas.width  != wNative) canvas.width  = wNative;
          if (canvas.height != hNative) canvas.height = hNative;
          if (typeof canvas.style != 'undefined') {
            if (w != wNative || h != hNative) {
              canvas.style.setProperty( "width", w + "px", "important");
              canvas.style.setProperty("height", h + "px", "important");
            } else {
              canvas.style.removeProperty( "width");
              canvas.style.removeProperty("height");
            }
          }
        }
      },wgetRequests:{},nextWgetRequestHandle:0,getNextWgetRequestHandle:function () {
        var handle = Browser.nextWgetRequestHandle;
        Browser.nextWgetRequestHandle++;
        return handle;
      }};function _emscripten_sleep(ms) {
      Module['setAsync'](); // tell the scheduler that we have a callback on hold
      Browser.safeSetTimeout(_emscripten_async_resume, ms);
    }



   

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    } 
Module["requestFullScreen"] = function Module_requestFullScreen(lockPointer, resizeCanvas, vrDevice) { Module.printErr("Module.requestFullScreen is deprecated. Please call Module.requestFullscreen instead."); Module["requestFullScreen"] = Module["requestFullscreen"]; Browser.requestFullScreen(lockPointer, resizeCanvas, vrDevice) };
  Module["requestFullscreen"] = function Module_requestFullscreen(lockPointer, resizeCanvas, vrDevice) { Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice) };
  Module["requestAnimationFrame"] = function Module_requestAnimationFrame(func) { Browser.requestAnimationFrame(func) };
  Module["setCanvasSize"] = function Module_setCanvasSize(width, height, noUpdates) { Browser.setCanvasSize(width, height, noUpdates) };
  Module["pauseMainLoop"] = function Module_pauseMainLoop() { Browser.mainLoop.pause() };
  Module["resumeMainLoop"] = function Module_resumeMainLoop() { Browser.mainLoop.resume() };
  Module["getUserMedia"] = function Module_getUserMedia() { Browser.getUserMedia() }
  Module["createContext"] = function Module_createContext(canvas, useWebGL, setInModule, webGLContextAttributes) { return Browser.createContext(canvas, useWebGL, setInModule, webGLContextAttributes) };
if (ENVIRONMENT_IS_NODE) {
    _emscripten_get_now = function _emscripten_get_now_actual() {
      var t = process['hrtime']();
      return t[0] * 1e3 + t[1] / 1e6;
    };
  } else if (typeof dateNow !== 'undefined') {
    _emscripten_get_now = dateNow;
  } else if (typeof self === 'object' && self['performance'] && typeof self['performance']['now'] === 'function') {
    _emscripten_get_now = function() { return self['performance']['now'](); };
  } else if (typeof performance === 'object' && typeof performance['now'] === 'function') {
    _emscripten_get_now = function() { return performance['now'](); };
  } else {
    _emscripten_get_now = Date.now;
  };
DYNAMICTOP_PTR = staticAlloc(4);

STACK_BASE = STACKTOP = alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

var ASSERTIONS = true;

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}



var debug_table_i = ["0"];
var debug_table_ii = ["0", "___stdio_close"];
var debug_table_iiii = ["0", "___stdout_write", "___stdio_seek", "_sn_write", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv", "___stdio_write", "0", "0"];
var debug_table_v = ["0"];
var debug_table_vi = ["0", "_mbed_trace_default_print", "__ZN10__cxxabiv116__shim_type_infoD2Ev", "__ZN10__cxxabiv117__class_type_infoD0Ev", "__ZNK10__cxxabiv116__shim_type_info5noop1Ev", "__ZNK10__cxxabiv116__shim_type_info5noop2Ev", "__ZN10__cxxabiv120__si_class_type_infoD0Ev", "_mbed_trace_default_print__async_cb", "_mbed_tracef__async_cb", "_mbed_vtracef__async_cb", "_mbed_vtracef__async_cb_34", "_mbed_vtracef__async_cb_24", "_mbed_vtracef__async_cb_25", "_mbed_vtracef__async_cb_26", "_mbed_vtracef__async_cb_33", "_mbed_vtracef__async_cb_27", "_mbed_vtracef__async_cb_32", "_mbed_vtracef__async_cb_28", "_mbed_vtracef__async_cb_29", "_mbed_vtracef__async_cb_30", "_mbed_vtracef__async_cb_31", "_mbed_trace_array__async_cb", "_mbed_assert_internal__async_cb", "_mbed_die__async_cb_16", "_mbed_die__async_cb_15", "_mbed_die__async_cb_14", "_mbed_die__async_cb_13", "_mbed_die__async_cb_12", "_mbed_die__async_cb_11", "_mbed_die__async_cb_10", "_mbed_die__async_cb_9", "_mbed_die__async_cb_8", "_mbed_die__async_cb_7", "_mbed_die__async_cb_6", "_mbed_die__async_cb_5", "_mbed_die__async_cb_4", "_mbed_die__async_cb_3", "_mbed_die__async_cb_2", "_mbed_die__async_cb", "_mbed_error_printf__async_cb", "_mbed_error_vfprintf__async_cb", "_mbed_error_vfprintf__async_cb_23", "_mbed_error_vfprintf__async_cb_22", "_serial_putc__async_cb_1", "_serial_putc__async_cb", "_invoke_ticker__async_cb_18", "_invoke_ticker__async_cb", "_wait_ms__async_cb", "_main__async_cb", "_putc__async_cb_17", "_putc__async_cb", "___overflow__async_cb", "_fflush__async_cb_37", "_fflush__async_cb_36", "_fflush__async_cb_38", "_fflush__async_cb", "___fflush_unlocked__async_cb", "___fflush_unlocked__async_cb_19", "_vfprintf__async_cb", "_snprintf__async_cb", "_vsnprintf__async_cb", "_puts__async_cb", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_20", "__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb", "___dynamic_cast__async_cb", "___dynamic_cast__async_cb_35", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_21", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb", "___cxa_can_catch__async_cb", "___cxa_is_pointer_type__async_cb", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_viiii = ["0", "__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi", "0"];
var debug_table_viiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib", "0"];
var debug_table_viiiiii = ["0", "__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib", "0"];
function nullFunc_i(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: i: " + debug_table_i[x] + "  iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  viiii: " + debug_table_viiii[x] + "  vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: v: " + debug_table_v[x] + "  viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  viiiii: " + debug_table_viiiii[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  vi: " + debug_table_vi[x] + "  viiiiii: " + debug_table_viiiiii[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: viiii: " + debug_table_viiii[x] + "  viiiii: " + debug_table_viiiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  iiii: " + debug_table_iiii[x] + "  ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  "); abort(x) }

function invoke_i(index) {
  try {
    return Module["dynCall_i"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "___lock": ___lock, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_asm_const_i": _emscripten_asm_const_i, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "_emscripten_get_now": _emscripten_get_now, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_emscripten_sleep": _emscripten_sleep, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___async": ___async, "___async_unwind": ___async_unwind, "___async_retval": ___async_retval, "___async_cur_frame": ___async_cur_frame };
// EMSCRIPTEN_START_ASM
var asm = (/** @suppress {uselessCode} */ function(global, env, buffer) {
'use asm';


  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);

  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var cttz_i8=env.cttz_i8|0;
  var ___async=env.___async|0;
  var ___async_unwind=env.___async_unwind|0;
  var ___async_retval=env.___async_retval|0;
  var ___async_cur_frame=env.___async_cur_frame|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntS = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_i=env.nullFunc_i;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_i=env.invoke_i;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var ___lock=env.___lock;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___unlock=env.___unlock;
  var _abort=env._abort;
  var _emscripten_asm_const_i=env._emscripten_asm_const_i;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var _emscripten_get_now=env._emscripten_get_now;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _emscripten_set_main_loop=env._emscripten_set_main_loop;
  var _emscripten_set_main_loop_timing=env._emscripten_set_main_loop_timing;
  var _emscripten_sleep=env._emscripten_sleep;
  var flush_NO_FILESYSTEM=env.flush_NO_FILESYSTEM;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
function _malloc($0) {
 $0 = $0 | 0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0, $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0, $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $1 = 0, $1004 = 0, $101 = 0, $1010 = 0, $1013 = 0, $1014 = 0, $102 = 0, $1032 = 0, $1034 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1052 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $108 = 0, $112 = 0, $114 = 0, $115 = 0, $117 = 0, $119 = 0, $121 = 0, $123 = 0, $125 = 0, $127 = 0, $129 = 0, $134 = 0, $138 = 0, $14 = 0, $143 = 0, $146 = 0, $149 = 0, $150 = 0, $157 = 0, $159 = 0, $16 = 0, $162 = 0, $164 = 0, $167 = 0, $169 = 0, $17 = 0, $172 = 0, $175 = 0, $176 = 0, $178 = 0, $179 = 0, $18 = 0, $181 = 0, $182 = 0, $184 = 0, $185 = 0, $19 = 0, $190 = 0, $191 = 0, $20 = 0, $204 = 0, $208 = 0, $214 = 0, $221 = 0, $225 = 0, $234 = 0, $235 = 0, $237 = 0, $238 = 0, $242 = 0, $243 = 0, $251 = 0, $252 = 0, $253 = 0, $255 = 0, $256 = 0, $261 = 0, $262 = 0, $265 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $282 = 0, $292 = 0, $296 = 0, $30 = 0, $302 = 0, $306 = 0, $309 = 0, $313 = 0, $315 = 0, $316 = 0, $318 = 0, $320 = 0, $322 = 0, $324 = 0, $326 = 0, $328 = 0, $330 = 0, $34 = 0, $340 = 0, $341 = 0, $352 = 0, $354 = 0, $357 = 0, $359 = 0, $362 = 0, $364 = 0, $367 = 0, $37 = 0, $370 = 0, $371 = 0, $373 = 0, $374 = 0, $376 = 0, $377 = 0, $379 = 0, $380 = 0, $385 = 0, $386 = 0, $391 = 0, $399 = 0, $403 = 0, $409 = 0, $41 = 0, $416 = 0, $420 = 0, $428 = 0, $431 = 0, $432 = 0, $433 = 0, $437 = 0, $438 = 0, $44 = 0, $444 = 0, $449 = 0, $450 = 0, $453 = 0, $455 = 0, $458 = 0, $463 = 0, $469 = 0, $47 = 0, $471 = 0, $473 = 0, $475 = 0, $49 = 0, $492 = 0, $494 = 0, $50 = 0, $501 = 0, $502 = 0, $503 = 0, $512 = 0, $514 = 0, $515 = 0, $517 = 0, $52 = 0, $526 = 0, $530 = 0, $532 = 0, $533 = 0, $534 = 0, $54 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $550 = 0, $552 = 0, $554 = 0, $555 = 0, $56 = 0, $561 = 0, $563 = 0, $565 = 0, $570 = 0, $572 = 0, $574 = 0, $575 = 0, $576 = 0, $58 = 0, $584 = 0, $585 = 0, $588 = 0, $592 = 0, $595 = 0, $597 = 0, $6 = 0, $60 = 0, $603 = 0, $607 = 0, $611 = 0, $62 = 0, $620 = 0, $621 = 0, $627 = 0, $629 = 0, $633 = 0, $636 = 0, $638 = 0, $64 = 0, $642 = 0, $644 = 0, $649 = 0, $650 = 0, $651 = 0, $657 = 0, $658 = 0, $659 = 0, $663 = 0, $67 = 0, $673 = 0, $675 = 0, $680 = 0, $681 = 0, $682 = 0, $688 = 0, $69 = 0, $690 = 0, $694 = 0, $7 = 0, $70 = 0, $700 = 0, $704 = 0, $71 = 0, $710 = 0, $712 = 0, $718 = 0, $72 = 0, $722 = 0, $723 = 0, $728 = 0, $73 = 0, $734 = 0, $739 = 0, $742 = 0, $743 = 0, $746 = 0, $748 = 0, $750 = 0, $753 = 0, $764 = 0, $769 = 0, $77 = 0, $771 = 0, $774 = 0, $776 = 0, $779 = 0, $782 = 0, $783 = 0, $784 = 0, $786 = 0, $788 = 0, $789 = 0, $791 = 0, $792 = 0, $797 = 0, $798 = 0, $8 = 0, $80 = 0, $812 = 0, $815 = 0, $816 = 0, $822 = 0, $83 = 0, $830 = 0, $836 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $845 = 0, $846 = 0, $852 = 0, $857 = 0, $858 = 0, $861 = 0, $863 = 0, $866 = 0, $87 = 0, $871 = 0, $877 = 0, $879 = 0, $881 = 0, $882 = 0, $9 = 0, $900 = 0, $902 = 0, $909 = 0, $910 = 0, $911 = 0, $919 = 0, $92 = 0, $923 = 0, $927 = 0, $929 = 0, $93 = 0, $935 = 0, $936 = 0, $938 = 0, $939 = 0, $940 = 0, $941 = 0, $943 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $956 = 0, $958 = 0, $96 = 0, $964 = 0, $969 = 0, $972 = 0, $973 = 0, $974 = 0, $978 = 0, $979 = 0, $98 = 0, $985 = 0, $990 = 0, $991 = 0, $994 = 0, $996 = 0, $999 = 0, label = 0, sp = 0, $958$looptemp = 0;
 sp = STACKTOP; //@line 1729
 STACKTOP = STACKTOP + 16 | 0; //@line 1730
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1730
 $1 = sp; //@line 1731
 do {
  if ($0 >>> 0 < 245) {
   $6 = $0 >>> 0 < 11 ? 16 : $0 + 11 & -8; //@line 1738
   $7 = $6 >>> 3; //@line 1739
   $8 = HEAP32[1005] | 0; //@line 1740
   $9 = $8 >>> $7; //@line 1741
   if ($9 & 3 | 0) {
    $14 = ($9 & 1 ^ 1) + $7 | 0; //@line 1747
    $16 = 4060 + ($14 << 1 << 2) | 0; //@line 1749
    $17 = $16 + 8 | 0; //@line 1750
    $18 = HEAP32[$17 >> 2] | 0; //@line 1751
    $19 = $18 + 8 | 0; //@line 1752
    $20 = HEAP32[$19 >> 2] | 0; //@line 1753
    do {
     if (($20 | 0) == ($16 | 0)) {
      HEAP32[1005] = $8 & ~(1 << $14); //@line 1760
     } else {
      if ((HEAP32[1009] | 0) >>> 0 > $20 >>> 0) {
       _abort(); //@line 1765
      }
      $27 = $20 + 12 | 0; //@line 1768
      if ((HEAP32[$27 >> 2] | 0) == ($18 | 0)) {
       HEAP32[$27 >> 2] = $16; //@line 1772
       HEAP32[$17 >> 2] = $20; //@line 1773
       break;
      } else {
       _abort(); //@line 1776
      }
     }
    } while (0);
    $30 = $14 << 3; //@line 1781
    HEAP32[$18 + 4 >> 2] = $30 | 3; //@line 1784
    $34 = $18 + $30 + 4 | 0; //@line 1786
    HEAP32[$34 >> 2] = HEAP32[$34 >> 2] | 1; //@line 1789
    $$0 = $19; //@line 1790
    STACKTOP = sp; //@line 1791
    return $$0 | 0; //@line 1791
   }
   $37 = HEAP32[1007] | 0; //@line 1793
   if ($6 >>> 0 > $37 >>> 0) {
    if ($9 | 0) {
     $41 = 2 << $7; //@line 1799
     $44 = $9 << $7 & ($41 | 0 - $41); //@line 1802
     $47 = ($44 & 0 - $44) + -1 | 0; //@line 1805
     $49 = $47 >>> 12 & 16; //@line 1807
     $50 = $47 >>> $49; //@line 1808
     $52 = $50 >>> 5 & 8; //@line 1810
     $54 = $50 >>> $52; //@line 1812
     $56 = $54 >>> 2 & 4; //@line 1814
     $58 = $54 >>> $56; //@line 1816
     $60 = $58 >>> 1 & 2; //@line 1818
     $62 = $58 >>> $60; //@line 1820
     $64 = $62 >>> 1 & 1; //@line 1822
     $67 = ($52 | $49 | $56 | $60 | $64) + ($62 >>> $64) | 0; //@line 1825
     $69 = 4060 + ($67 << 1 << 2) | 0; //@line 1827
     $70 = $69 + 8 | 0; //@line 1828
     $71 = HEAP32[$70 >> 2] | 0; //@line 1829
     $72 = $71 + 8 | 0; //@line 1830
     $73 = HEAP32[$72 >> 2] | 0; //@line 1831
     do {
      if (($73 | 0) == ($69 | 0)) {
       $77 = $8 & ~(1 << $67); //@line 1837
       HEAP32[1005] = $77; //@line 1838
       $98 = $77; //@line 1839
      } else {
       if ((HEAP32[1009] | 0) >>> 0 > $73 >>> 0) {
        _abort(); //@line 1844
       }
       $80 = $73 + 12 | 0; //@line 1847
       if ((HEAP32[$80 >> 2] | 0) == ($71 | 0)) {
        HEAP32[$80 >> 2] = $69; //@line 1851
        HEAP32[$70 >> 2] = $73; //@line 1852
        $98 = $8; //@line 1853
        break;
       } else {
        _abort(); //@line 1856
       }
      }
     } while (0);
     $83 = $67 << 3; //@line 1861
     $84 = $83 - $6 | 0; //@line 1862
     HEAP32[$71 + 4 >> 2] = $6 | 3; //@line 1865
     $87 = $71 + $6 | 0; //@line 1866
     HEAP32[$87 + 4 >> 2] = $84 | 1; //@line 1869
     HEAP32[$71 + $83 >> 2] = $84; //@line 1871
     if ($37 | 0) {
      $92 = HEAP32[1010] | 0; //@line 1874
      $93 = $37 >>> 3; //@line 1875
      $95 = 4060 + ($93 << 1 << 2) | 0; //@line 1877
      $96 = 1 << $93; //@line 1878
      if (!($98 & $96)) {
       HEAP32[1005] = $98 | $96; //@line 1883
       $$0199 = $95; //@line 1885
       $$pre$phiZ2D = $95 + 8 | 0; //@line 1885
      } else {
       $101 = $95 + 8 | 0; //@line 1887
       $102 = HEAP32[$101 >> 2] | 0; //@line 1888
       if ((HEAP32[1009] | 0) >>> 0 > $102 >>> 0) {
        _abort(); //@line 1892
       } else {
        $$0199 = $102; //@line 1895
        $$pre$phiZ2D = $101; //@line 1895
       }
      }
      HEAP32[$$pre$phiZ2D >> 2] = $92; //@line 1898
      HEAP32[$$0199 + 12 >> 2] = $92; //@line 1900
      HEAP32[$92 + 8 >> 2] = $$0199; //@line 1902
      HEAP32[$92 + 12 >> 2] = $95; //@line 1904
     }
     HEAP32[1007] = $84; //@line 1906
     HEAP32[1010] = $87; //@line 1907
     $$0 = $72; //@line 1908
     STACKTOP = sp; //@line 1909
     return $$0 | 0; //@line 1909
    }
    $108 = HEAP32[1006] | 0; //@line 1911
    if (!$108) {
     $$0197 = $6; //@line 1914
    } else {
     $112 = ($108 & 0 - $108) + -1 | 0; //@line 1918
     $114 = $112 >>> 12 & 16; //@line 1920
     $115 = $112 >>> $114; //@line 1921
     $117 = $115 >>> 5 & 8; //@line 1923
     $119 = $115 >>> $117; //@line 1925
     $121 = $119 >>> 2 & 4; //@line 1927
     $123 = $119 >>> $121; //@line 1929
     $125 = $123 >>> 1 & 2; //@line 1931
     $127 = $123 >>> $125; //@line 1933
     $129 = $127 >>> 1 & 1; //@line 1935
     $134 = HEAP32[4324 + (($117 | $114 | $121 | $125 | $129) + ($127 >>> $129) << 2) >> 2] | 0; //@line 1940
     $138 = (HEAP32[$134 + 4 >> 2] & -8) - $6 | 0; //@line 1944
     $143 = HEAP32[$134 + 16 + (((HEAP32[$134 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1950
     if (!$143) {
      $$0192$lcssa$i = $134; //@line 1953
      $$0193$lcssa$i = $138; //@line 1953
     } else {
      $$01926$i = $134; //@line 1955
      $$01935$i = $138; //@line 1955
      $146 = $143; //@line 1955
      while (1) {
       $149 = (HEAP32[$146 + 4 >> 2] & -8) - $6 | 0; //@line 1960
       $150 = $149 >>> 0 < $$01935$i >>> 0; //@line 1961
       $$$0193$i = $150 ? $149 : $$01935$i; //@line 1962
       $$$0192$i = $150 ? $146 : $$01926$i; //@line 1963
       $146 = HEAP32[$146 + 16 + (((HEAP32[$146 + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 1969
       if (!$146) {
        $$0192$lcssa$i = $$$0192$i; //@line 1972
        $$0193$lcssa$i = $$$0193$i; //@line 1972
        break;
       } else {
        $$01926$i = $$$0192$i; //@line 1975
        $$01935$i = $$$0193$i; //@line 1975
       }
      }
     }
     $157 = HEAP32[1009] | 0; //@line 1979
     if ($157 >>> 0 > $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1982
     }
     $159 = $$0192$lcssa$i + $6 | 0; //@line 1985
     if ($159 >>> 0 <= $$0192$lcssa$i >>> 0) {
      _abort(); //@line 1988
     }
     $162 = HEAP32[$$0192$lcssa$i + 24 >> 2] | 0; //@line 1992
     $164 = HEAP32[$$0192$lcssa$i + 12 >> 2] | 0; //@line 1994
     do {
      if (($164 | 0) == ($$0192$lcssa$i | 0)) {
       $175 = $$0192$lcssa$i + 20 | 0; //@line 1998
       $176 = HEAP32[$175 >> 2] | 0; //@line 1999
       if (!$176) {
        $178 = $$0192$lcssa$i + 16 | 0; //@line 2002
        $179 = HEAP32[$178 >> 2] | 0; //@line 2003
        if (!$179) {
         $$3$i = 0; //@line 2006
         break;
        } else {
         $$1196$i = $179; //@line 2009
         $$1198$i = $178; //@line 2009
        }
       } else {
        $$1196$i = $176; //@line 2012
        $$1198$i = $175; //@line 2012
       }
       while (1) {
        $181 = $$1196$i + 20 | 0; //@line 2015
        $182 = HEAP32[$181 >> 2] | 0; //@line 2016
        if ($182 | 0) {
         $$1196$i = $182; //@line 2019
         $$1198$i = $181; //@line 2019
         continue;
        }
        $184 = $$1196$i + 16 | 0; //@line 2022
        $185 = HEAP32[$184 >> 2] | 0; //@line 2023
        if (!$185) {
         break;
        } else {
         $$1196$i = $185; //@line 2028
         $$1198$i = $184; //@line 2028
        }
       }
       if ($157 >>> 0 > $$1198$i >>> 0) {
        _abort(); //@line 2033
       } else {
        HEAP32[$$1198$i >> 2] = 0; //@line 2036
        $$3$i = $$1196$i; //@line 2037
        break;
       }
      } else {
       $167 = HEAP32[$$0192$lcssa$i + 8 >> 2] | 0; //@line 2042
       if ($157 >>> 0 > $167 >>> 0) {
        _abort(); //@line 2045
       }
       $169 = $167 + 12 | 0; //@line 2048
       if ((HEAP32[$169 >> 2] | 0) != ($$0192$lcssa$i | 0)) {
        _abort(); //@line 2052
       }
       $172 = $164 + 8 | 0; //@line 2055
       if ((HEAP32[$172 >> 2] | 0) == ($$0192$lcssa$i | 0)) {
        HEAP32[$169 >> 2] = $164; //@line 2059
        HEAP32[$172 >> 2] = $167; //@line 2060
        $$3$i = $164; //@line 2061
        break;
       } else {
        _abort(); //@line 2064
       }
      }
     } while (0);
     L73 : do {
      if ($162 | 0) {
       $190 = HEAP32[$$0192$lcssa$i + 28 >> 2] | 0; //@line 2073
       $191 = 4324 + ($190 << 2) | 0; //@line 2074
       do {
        if (($$0192$lcssa$i | 0) == (HEAP32[$191 >> 2] | 0)) {
         HEAP32[$191 >> 2] = $$3$i; //@line 2079
         if (!$$3$i) {
          HEAP32[1006] = $108 & ~(1 << $190); //@line 2085
          break L73;
         }
        } else {
         if ((HEAP32[1009] | 0) >>> 0 > $162 >>> 0) {
          _abort(); //@line 2092
         } else {
          HEAP32[$162 + 16 + (((HEAP32[$162 + 16 >> 2] | 0) != ($$0192$lcssa$i | 0) & 1) << 2) >> 2] = $$3$i; //@line 2100
          if (!$$3$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while (0);
       $204 = HEAP32[1009] | 0; //@line 2110
       if ($204 >>> 0 > $$3$i >>> 0) {
        _abort(); //@line 2113
       }
       HEAP32[$$3$i + 24 >> 2] = $162; //@line 2117
       $208 = HEAP32[$$0192$lcssa$i + 16 >> 2] | 0; //@line 2119
       do {
        if ($208 | 0) {
         if ($204 >>> 0 > $208 >>> 0) {
          _abort(); //@line 2125
         } else {
          HEAP32[$$3$i + 16 >> 2] = $208; //@line 2129
          HEAP32[$208 + 24 >> 2] = $$3$i; //@line 2131
          break;
         }
        }
       } while (0);
       $214 = HEAP32[$$0192$lcssa$i + 20 >> 2] | 0; //@line 2137
       if ($214 | 0) {
        if ((HEAP32[1009] | 0) >>> 0 > $214 >>> 0) {
         _abort(); //@line 2143
        } else {
         HEAP32[$$3$i + 20 >> 2] = $214; //@line 2147
         HEAP32[$214 + 24 >> 2] = $$3$i; //@line 2149
         break;
        }
       }
      }
     } while (0);
     if ($$0193$lcssa$i >>> 0 < 16) {
      $221 = $$0193$lcssa$i + $6 | 0; //@line 2157
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $221 | 3; //@line 2160
      $225 = $$0192$lcssa$i + $221 + 4 | 0; //@line 2162
      HEAP32[$225 >> 2] = HEAP32[$225 >> 2] | 1; //@line 2165
     } else {
      HEAP32[$$0192$lcssa$i + 4 >> 2] = $6 | 3; //@line 2169
      HEAP32[$159 + 4 >> 2] = $$0193$lcssa$i | 1; //@line 2172
      HEAP32[$159 + $$0193$lcssa$i >> 2] = $$0193$lcssa$i; //@line 2174
      if ($37 | 0) {
       $234 = HEAP32[1010] | 0; //@line 2177
       $235 = $37 >>> 3; //@line 2178
       $237 = 4060 + ($235 << 1 << 2) | 0; //@line 2180
       $238 = 1 << $235; //@line 2181
       if (!($8 & $238)) {
        HEAP32[1005] = $8 | $238; //@line 2186
        $$0189$i = $237; //@line 2188
        $$pre$phi$iZ2D = $237 + 8 | 0; //@line 2188
       } else {
        $242 = $237 + 8 | 0; //@line 2190
        $243 = HEAP32[$242 >> 2] | 0; //@line 2191
        if ((HEAP32[1009] | 0) >>> 0 > $243 >>> 0) {
         _abort(); //@line 2195
        } else {
         $$0189$i = $243; //@line 2198
         $$pre$phi$iZ2D = $242; //@line 2198
        }
       }
       HEAP32[$$pre$phi$iZ2D >> 2] = $234; //@line 2201
       HEAP32[$$0189$i + 12 >> 2] = $234; //@line 2203
       HEAP32[$234 + 8 >> 2] = $$0189$i; //@line 2205
       HEAP32[$234 + 12 >> 2] = $237; //@line 2207
      }
      HEAP32[1007] = $$0193$lcssa$i; //@line 2209
      HEAP32[1010] = $159; //@line 2210
     }
     $$0 = $$0192$lcssa$i + 8 | 0; //@line 2213
     STACKTOP = sp; //@line 2214
     return $$0 | 0; //@line 2214
    }
   } else {
    $$0197 = $6; //@line 2217
   }
  } else {
   if ($0 >>> 0 > 4294967231) {
    $$0197 = -1; //@line 2222
   } else {
    $251 = $0 + 11 | 0; //@line 2224
    $252 = $251 & -8; //@line 2225
    $253 = HEAP32[1006] | 0; //@line 2226
    if (!$253) {
     $$0197 = $252; //@line 2229
    } else {
     $255 = 0 - $252 | 0; //@line 2231
     $256 = $251 >>> 8; //@line 2232
     if (!$256) {
      $$0358$i = 0; //@line 2235
     } else {
      if ($252 >>> 0 > 16777215) {
       $$0358$i = 31; //@line 2239
      } else {
       $261 = ($256 + 1048320 | 0) >>> 16 & 8; //@line 2243
       $262 = $256 << $261; //@line 2244
       $265 = ($262 + 520192 | 0) >>> 16 & 4; //@line 2247
       $267 = $262 << $265; //@line 2249
       $270 = ($267 + 245760 | 0) >>> 16 & 2; //@line 2252
       $275 = 14 - ($265 | $261 | $270) + ($267 << $270 >>> 15) | 0; //@line 2257
       $$0358$i = $252 >>> ($275 + 7 | 0) & 1 | $275 << 1; //@line 2263
      }
     }
     $282 = HEAP32[4324 + ($$0358$i << 2) >> 2] | 0; //@line 2267
     L117 : do {
      if (!$282) {
       $$2355$i = 0; //@line 2271
       $$3$i203 = 0; //@line 2271
       $$3350$i = $255; //@line 2271
       label = 81; //@line 2272
      } else {
       $$0342$i = 0; //@line 2279
       $$0347$i = $255; //@line 2279
       $$0353$i = $282; //@line 2279
       $$0359$i = $252 << (($$0358$i | 0) == 31 ? 0 : 25 - ($$0358$i >>> 1) | 0); //@line 2279
       $$0362$i = 0; //@line 2279
       while (1) {
        $292 = (HEAP32[$$0353$i + 4 >> 2] & -8) - $252 | 0; //@line 2284
        if ($292 >>> 0 < $$0347$i >>> 0) {
         if (!$292) {
          $$414$i = $$0353$i; //@line 2289
          $$435113$i = 0; //@line 2289
          $$435712$i = $$0353$i; //@line 2289
          label = 85; //@line 2290
          break L117;
         } else {
          $$1343$i = $$0353$i; //@line 2293
          $$1348$i = $292; //@line 2293
         }
        } else {
         $$1343$i = $$0342$i; //@line 2296
         $$1348$i = $$0347$i; //@line 2296
        }
        $296 = HEAP32[$$0353$i + 20 >> 2] | 0; //@line 2299
        $$0353$i = HEAP32[$$0353$i + 16 + ($$0359$i >>> 31 << 2) >> 2] | 0; //@line 2302
        $$1363$i = ($296 | 0) == 0 | ($296 | 0) == ($$0353$i | 0) ? $$0362$i : $296; //@line 2306
        $302 = ($$0353$i | 0) == 0; //@line 2307
        if ($302) {
         $$2355$i = $$1363$i; //@line 2312
         $$3$i203 = $$1343$i; //@line 2312
         $$3350$i = $$1348$i; //@line 2312
         label = 81; //@line 2313
         break;
        } else {
         $$0342$i = $$1343$i; //@line 2316
         $$0347$i = $$1348$i; //@line 2316
         $$0359$i = $$0359$i << (($302 ^ 1) & 1); //@line 2316
         $$0362$i = $$1363$i; //@line 2316
        }
       }
      }
     } while (0);
     if ((label | 0) == 81) {
      if (($$2355$i | 0) == 0 & ($$3$i203 | 0) == 0) {
       $306 = 2 << $$0358$i; //@line 2326
       $309 = $253 & ($306 | 0 - $306); //@line 2329
       if (!$309) {
        $$0197 = $252; //@line 2332
        break;
       }
       $313 = ($309 & 0 - $309) + -1 | 0; //@line 2337
       $315 = $313 >>> 12 & 16; //@line 2339
       $316 = $313 >>> $315; //@line 2340
       $318 = $316 >>> 5 & 8; //@line 2342
       $320 = $316 >>> $318; //@line 2344
       $322 = $320 >>> 2 & 4; //@line 2346
       $324 = $320 >>> $322; //@line 2348
       $326 = $324 >>> 1 & 2; //@line 2350
       $328 = $324 >>> $326; //@line 2352
       $330 = $328 >>> 1 & 1; //@line 2354
       $$4$ph$i = 0; //@line 2360
       $$4357$ph$i = HEAP32[4324 + (($318 | $315 | $322 | $326 | $330) + ($328 >>> $330) << 2) >> 2] | 0; //@line 2360
      } else {
       $$4$ph$i = $$3$i203; //@line 2362
       $$4357$ph$i = $$2355$i; //@line 2362
      }
      if (!$$4357$ph$i) {
       $$4$lcssa$i = $$4$ph$i; //@line 2366
       $$4351$lcssa$i = $$3350$i; //@line 2366
      } else {
       $$414$i = $$4$ph$i; //@line 2368
       $$435113$i = $$3350$i; //@line 2368
       $$435712$i = $$4357$ph$i; //@line 2368
       label = 85; //@line 2369
      }
     }
     if ((label | 0) == 85) {
      while (1) {
       label = 0; //@line 2374
       $340 = (HEAP32[$$435712$i + 4 >> 2] & -8) - $252 | 0; //@line 2378
       $341 = $340 >>> 0 < $$435113$i >>> 0; //@line 2379
       $$$4351$i = $341 ? $340 : $$435113$i; //@line 2380
       $$4357$$4$i = $341 ? $$435712$i : $$414$i; //@line 2381
       $$435712$i = HEAP32[$$435712$i + 16 + (((HEAP32[$$435712$i + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0; //@line 2387
       if (!$$435712$i) {
        $$4$lcssa$i = $$4357$$4$i; //@line 2390
        $$4351$lcssa$i = $$$4351$i; //@line 2390
        break;
       } else {
        $$414$i = $$4357$$4$i; //@line 2393
        $$435113$i = $$$4351$i; //@line 2393
        label = 85; //@line 2394
       }
      }
     }
     if (!$$4$lcssa$i) {
      $$0197 = $252; //@line 2400
     } else {
      if ($$4351$lcssa$i >>> 0 < ((HEAP32[1007] | 0) - $252 | 0) >>> 0) {
       $352 = HEAP32[1009] | 0; //@line 2406
       if ($352 >>> 0 > $$4$lcssa$i >>> 0) {
        _abort(); //@line 2409
       }
       $354 = $$4$lcssa$i + $252 | 0; //@line 2412
       if ($354 >>> 0 <= $$4$lcssa$i >>> 0) {
        _abort(); //@line 2415
       }
       $357 = HEAP32[$$4$lcssa$i + 24 >> 2] | 0; //@line 2419
       $359 = HEAP32[$$4$lcssa$i + 12 >> 2] | 0; //@line 2421
       do {
        if (($359 | 0) == ($$4$lcssa$i | 0)) {
         $370 = $$4$lcssa$i + 20 | 0; //@line 2425
         $371 = HEAP32[$370 >> 2] | 0; //@line 2426
         if (!$371) {
          $373 = $$4$lcssa$i + 16 | 0; //@line 2429
          $374 = HEAP32[$373 >> 2] | 0; //@line 2430
          if (!$374) {
           $$3372$i = 0; //@line 2433
           break;
          } else {
           $$1370$i = $374; //@line 2436
           $$1374$i = $373; //@line 2436
          }
         } else {
          $$1370$i = $371; //@line 2439
          $$1374$i = $370; //@line 2439
         }
         while (1) {
          $376 = $$1370$i + 20 | 0; //@line 2442
          $377 = HEAP32[$376 >> 2] | 0; //@line 2443
          if ($377 | 0) {
           $$1370$i = $377; //@line 2446
           $$1374$i = $376; //@line 2446
           continue;
          }
          $379 = $$1370$i + 16 | 0; //@line 2449
          $380 = HEAP32[$379 >> 2] | 0; //@line 2450
          if (!$380) {
           break;
          } else {
           $$1370$i = $380; //@line 2455
           $$1374$i = $379; //@line 2455
          }
         }
         if ($352 >>> 0 > $$1374$i >>> 0) {
          _abort(); //@line 2460
         } else {
          HEAP32[$$1374$i >> 2] = 0; //@line 2463
          $$3372$i = $$1370$i; //@line 2464
          break;
         }
        } else {
         $362 = HEAP32[$$4$lcssa$i + 8 >> 2] | 0; //@line 2469
         if ($352 >>> 0 > $362 >>> 0) {
          _abort(); //@line 2472
         }
         $364 = $362 + 12 | 0; //@line 2475
         if ((HEAP32[$364 >> 2] | 0) != ($$4$lcssa$i | 0)) {
          _abort(); //@line 2479
         }
         $367 = $359 + 8 | 0; //@line 2482
         if ((HEAP32[$367 >> 2] | 0) == ($$4$lcssa$i | 0)) {
          HEAP32[$364 >> 2] = $359; //@line 2486
          HEAP32[$367 >> 2] = $362; //@line 2487
          $$3372$i = $359; //@line 2488
          break;
         } else {
          _abort(); //@line 2491
         }
        }
       } while (0);
       L164 : do {
        if (!$357) {
         $475 = $253; //@line 2499
        } else {
         $385 = HEAP32[$$4$lcssa$i + 28 >> 2] | 0; //@line 2502
         $386 = 4324 + ($385 << 2) | 0; //@line 2503
         do {
          if (($$4$lcssa$i | 0) == (HEAP32[$386 >> 2] | 0)) {
           HEAP32[$386 >> 2] = $$3372$i; //@line 2508
           if (!$$3372$i) {
            $391 = $253 & ~(1 << $385); //@line 2513
            HEAP32[1006] = $391; //@line 2514
            $475 = $391; //@line 2515
            break L164;
           }
          } else {
           if ((HEAP32[1009] | 0) >>> 0 > $357 >>> 0) {
            _abort(); //@line 2522
           } else {
            HEAP32[$357 + 16 + (((HEAP32[$357 + 16 >> 2] | 0) != ($$4$lcssa$i | 0) & 1) << 2) >> 2] = $$3372$i; //@line 2530
            if (!$$3372$i) {
             $475 = $253; //@line 2533
             break L164;
            } else {
             break;
            }
           }
          }
         } while (0);
         $399 = HEAP32[1009] | 0; //@line 2541
         if ($399 >>> 0 > $$3372$i >>> 0) {
          _abort(); //@line 2544
         }
         HEAP32[$$3372$i + 24 >> 2] = $357; //@line 2548
         $403 = HEAP32[$$4$lcssa$i + 16 >> 2] | 0; //@line 2550
         do {
          if ($403 | 0) {
           if ($399 >>> 0 > $403 >>> 0) {
            _abort(); //@line 2556
           } else {
            HEAP32[$$3372$i + 16 >> 2] = $403; //@line 2560
            HEAP32[$403 + 24 >> 2] = $$3372$i; //@line 2562
            break;
           }
          }
         } while (0);
         $409 = HEAP32[$$4$lcssa$i + 20 >> 2] | 0; //@line 2568
         if (!$409) {
          $475 = $253; //@line 2571
         } else {
          if ((HEAP32[1009] | 0) >>> 0 > $409 >>> 0) {
           _abort(); //@line 2576
          } else {
           HEAP32[$$3372$i + 20 >> 2] = $409; //@line 2580
           HEAP32[$409 + 24 >> 2] = $$3372$i; //@line 2582
           $475 = $253; //@line 2583
           break;
          }
         }
        }
       } while (0);
       do {
        if ($$4351$lcssa$i >>> 0 < 16) {
         $416 = $$4351$lcssa$i + $252 | 0; //@line 2592
         HEAP32[$$4$lcssa$i + 4 >> 2] = $416 | 3; //@line 2595
         $420 = $$4$lcssa$i + $416 + 4 | 0; //@line 2597
         HEAP32[$420 >> 2] = HEAP32[$420 >> 2] | 1; //@line 2600
        } else {
         HEAP32[$$4$lcssa$i + 4 >> 2] = $252 | 3; //@line 2604
         HEAP32[$354 + 4 >> 2] = $$4351$lcssa$i | 1; //@line 2607
         HEAP32[$354 + $$4351$lcssa$i >> 2] = $$4351$lcssa$i; //@line 2609
         $428 = $$4351$lcssa$i >>> 3; //@line 2610
         if ($$4351$lcssa$i >>> 0 < 256) {
          $431 = 4060 + ($428 << 1 << 2) | 0; //@line 2614
          $432 = HEAP32[1005] | 0; //@line 2615
          $433 = 1 << $428; //@line 2616
          if (!($432 & $433)) {
           HEAP32[1005] = $432 | $433; //@line 2621
           $$0368$i = $431; //@line 2623
           $$pre$phi$i211Z2D = $431 + 8 | 0; //@line 2623
          } else {
           $437 = $431 + 8 | 0; //@line 2625
           $438 = HEAP32[$437 >> 2] | 0; //@line 2626
           if ((HEAP32[1009] | 0) >>> 0 > $438 >>> 0) {
            _abort(); //@line 2630
           } else {
            $$0368$i = $438; //@line 2633
            $$pre$phi$i211Z2D = $437; //@line 2633
           }
          }
          HEAP32[$$pre$phi$i211Z2D >> 2] = $354; //@line 2636
          HEAP32[$$0368$i + 12 >> 2] = $354; //@line 2638
          HEAP32[$354 + 8 >> 2] = $$0368$i; //@line 2640
          HEAP32[$354 + 12 >> 2] = $431; //@line 2642
          break;
         }
         $444 = $$4351$lcssa$i >>> 8; //@line 2645
         if (!$444) {
          $$0361$i = 0; //@line 2648
         } else {
          if ($$4351$lcssa$i >>> 0 > 16777215) {
           $$0361$i = 31; //@line 2652
          } else {
           $449 = ($444 + 1048320 | 0) >>> 16 & 8; //@line 2656
           $450 = $444 << $449; //@line 2657
           $453 = ($450 + 520192 | 0) >>> 16 & 4; //@line 2660
           $455 = $450 << $453; //@line 2662
           $458 = ($455 + 245760 | 0) >>> 16 & 2; //@line 2665
           $463 = 14 - ($453 | $449 | $458) + ($455 << $458 >>> 15) | 0; //@line 2670
           $$0361$i = $$4351$lcssa$i >>> ($463 + 7 | 0) & 1 | $463 << 1; //@line 2676
          }
         }
         $469 = 4324 + ($$0361$i << 2) | 0; //@line 2679
         HEAP32[$354 + 28 >> 2] = $$0361$i; //@line 2681
         $471 = $354 + 16 | 0; //@line 2682
         HEAP32[$471 + 4 >> 2] = 0; //@line 2684
         HEAP32[$471 >> 2] = 0; //@line 2685
         $473 = 1 << $$0361$i; //@line 2686
         if (!($475 & $473)) {
          HEAP32[1006] = $475 | $473; //@line 2691
          HEAP32[$469 >> 2] = $354; //@line 2692
          HEAP32[$354 + 24 >> 2] = $469; //@line 2694
          HEAP32[$354 + 12 >> 2] = $354; //@line 2696
          HEAP32[$354 + 8 >> 2] = $354; //@line 2698
          break;
         }
         $$0344$i = $$4351$lcssa$i << (($$0361$i | 0) == 31 ? 0 : 25 - ($$0361$i >>> 1) | 0); //@line 2707
         $$0345$i = HEAP32[$469 >> 2] | 0; //@line 2707
         while (1) {
          if ((HEAP32[$$0345$i + 4 >> 2] & -8 | 0) == ($$4351$lcssa$i | 0)) {
           label = 139; //@line 2714
           break;
          }
          $492 = $$0345$i + 16 + ($$0344$i >>> 31 << 2) | 0; //@line 2718
          $494 = HEAP32[$492 >> 2] | 0; //@line 2720
          if (!$494) {
           label = 136; //@line 2723
           break;
          } else {
           $$0344$i = $$0344$i << 1; //@line 2726
           $$0345$i = $494; //@line 2726
          }
         }
         if ((label | 0) == 136) {
          if ((HEAP32[1009] | 0) >>> 0 > $492 >>> 0) {
           _abort(); //@line 2733
          } else {
           HEAP32[$492 >> 2] = $354; //@line 2736
           HEAP32[$354 + 24 >> 2] = $$0345$i; //@line 2738
           HEAP32[$354 + 12 >> 2] = $354; //@line 2740
           HEAP32[$354 + 8 >> 2] = $354; //@line 2742
           break;
          }
         } else if ((label | 0) == 139) {
          $501 = $$0345$i + 8 | 0; //@line 2747
          $502 = HEAP32[$501 >> 2] | 0; //@line 2748
          $503 = HEAP32[1009] | 0; //@line 2749
          if ($503 >>> 0 <= $502 >>> 0 & $503 >>> 0 <= $$0345$i >>> 0) {
           HEAP32[$502 + 12 >> 2] = $354; //@line 2755
           HEAP32[$501 >> 2] = $354; //@line 2756
           HEAP32[$354 + 8 >> 2] = $502; //@line 2758
           HEAP32[$354 + 12 >> 2] = $$0345$i; //@line 2760
           HEAP32[$354 + 24 >> 2] = 0; //@line 2762
           break;
          } else {
           _abort(); //@line 2765
          }
         }
        }
       } while (0);
       $$0 = $$4$lcssa$i + 8 | 0; //@line 2772
       STACKTOP = sp; //@line 2773
       return $$0 | 0; //@line 2773
      } else {
       $$0197 = $252; //@line 2775
      }
     }
    }
   }
  }
 } while (0);
 $512 = HEAP32[1007] | 0; //@line 2782
 if ($512 >>> 0 >= $$0197 >>> 0) {
  $514 = $512 - $$0197 | 0; //@line 2785
  $515 = HEAP32[1010] | 0; //@line 2786
  if ($514 >>> 0 > 15) {
   $517 = $515 + $$0197 | 0; //@line 2789
   HEAP32[1010] = $517; //@line 2790
   HEAP32[1007] = $514; //@line 2791
   HEAP32[$517 + 4 >> 2] = $514 | 1; //@line 2794
   HEAP32[$515 + $512 >> 2] = $514; //@line 2796
   HEAP32[$515 + 4 >> 2] = $$0197 | 3; //@line 2799
  } else {
   HEAP32[1007] = 0; //@line 2801
   HEAP32[1010] = 0; //@line 2802
   HEAP32[$515 + 4 >> 2] = $512 | 3; //@line 2805
   $526 = $515 + $512 + 4 | 0; //@line 2807
   HEAP32[$526 >> 2] = HEAP32[$526 >> 2] | 1; //@line 2810
  }
  $$0 = $515 + 8 | 0; //@line 2813
  STACKTOP = sp; //@line 2814
  return $$0 | 0; //@line 2814
 }
 $530 = HEAP32[1008] | 0; //@line 2816
 if ($530 >>> 0 > $$0197 >>> 0) {
  $532 = $530 - $$0197 | 0; //@line 2819
  HEAP32[1008] = $532; //@line 2820
  $533 = HEAP32[1011] | 0; //@line 2821
  $534 = $533 + $$0197 | 0; //@line 2822
  HEAP32[1011] = $534; //@line 2823
  HEAP32[$534 + 4 >> 2] = $532 | 1; //@line 2826
  HEAP32[$533 + 4 >> 2] = $$0197 | 3; //@line 2829
  $$0 = $533 + 8 | 0; //@line 2831
  STACKTOP = sp; //@line 2832
  return $$0 | 0; //@line 2832
 }
 if (!(HEAP32[1123] | 0)) {
  HEAP32[1125] = 4096; //@line 2837
  HEAP32[1124] = 4096; //@line 2838
  HEAP32[1126] = -1; //@line 2839
  HEAP32[1127] = -1; //@line 2840
  HEAP32[1128] = 0; //@line 2841
  HEAP32[1116] = 0; //@line 2842
  HEAP32[1123] = $1 & -16 ^ 1431655768; //@line 2846
  $548 = 4096; //@line 2847
 } else {
  $548 = HEAP32[1125] | 0; //@line 2850
 }
 $545 = $$0197 + 48 | 0; //@line 2852
 $546 = $$0197 + 47 | 0; //@line 2853
 $547 = $548 + $546 | 0; //@line 2854
 $549 = 0 - $548 | 0; //@line 2855
 $550 = $547 & $549; //@line 2856
 if ($550 >>> 0 <= $$0197 >>> 0) {
  $$0 = 0; //@line 2859
  STACKTOP = sp; //@line 2860
  return $$0 | 0; //@line 2860
 }
 $552 = HEAP32[1115] | 0; //@line 2862
 if ($552 | 0) {
  $554 = HEAP32[1113] | 0; //@line 2865
  $555 = $554 + $550 | 0; //@line 2866
  if ($555 >>> 0 <= $554 >>> 0 | $555 >>> 0 > $552 >>> 0) {
   $$0 = 0; //@line 2871
   STACKTOP = sp; //@line 2872
   return $$0 | 0; //@line 2872
  }
 }
 L244 : do {
  if (!(HEAP32[1116] & 4)) {
   $561 = HEAP32[1011] | 0; //@line 2880
   L246 : do {
    if (!$561) {
     label = 163; //@line 2884
    } else {
     $$0$i$i = 4468; //@line 2886
     while (1) {
      $563 = HEAP32[$$0$i$i >> 2] | 0; //@line 2888
      if ($563 >>> 0 <= $561 >>> 0) {
       $565 = $$0$i$i + 4 | 0; //@line 2891
       if (($563 + (HEAP32[$565 >> 2] | 0) | 0) >>> 0 > $561 >>> 0) {
        break;
       }
      }
      $570 = HEAP32[$$0$i$i + 8 >> 2] | 0; //@line 2900
      if (!$570) {
       label = 163; //@line 2903
       break L246;
      } else {
       $$0$i$i = $570; //@line 2906
      }
     }
     $595 = $547 - $530 & $549; //@line 2910
     if ($595 >>> 0 < 2147483647) {
      $597 = _sbrk($595 | 0) | 0; //@line 2913
      if (($597 | 0) == ((HEAP32[$$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0) | 0)) {
       if (($597 | 0) == (-1 | 0)) {
        $$2234243136$i = $595; //@line 2921
       } else {
        $$723947$i = $595; //@line 2923
        $$748$i = $597; //@line 2923
        label = 180; //@line 2924
        break L244;
       }
      } else {
       $$2247$ph$i = $597; //@line 2928
       $$2253$ph$i = $595; //@line 2928
       label = 171; //@line 2929
      }
     } else {
      $$2234243136$i = 0; //@line 2932
     }
    }
   } while (0);
   do {
    if ((label | 0) == 163) {
     $572 = _sbrk(0) | 0; //@line 2938
     if (($572 | 0) == (-1 | 0)) {
      $$2234243136$i = 0; //@line 2941
     } else {
      $574 = $572; //@line 2943
      $575 = HEAP32[1124] | 0; //@line 2944
      $576 = $575 + -1 | 0; //@line 2945
      $$$i = (($576 & $574 | 0) == 0 ? 0 : ($576 + $574 & 0 - $575) - $574 | 0) + $550 | 0; //@line 2953
      $584 = HEAP32[1113] | 0; //@line 2954
      $585 = $$$i + $584 | 0; //@line 2955
      if ($$$i >>> 0 > $$0197 >>> 0 & $$$i >>> 0 < 2147483647) {
       $588 = HEAP32[1115] | 0; //@line 2960
       if ($588 | 0) {
        if ($585 >>> 0 <= $584 >>> 0 | $585 >>> 0 > $588 >>> 0) {
         $$2234243136$i = 0; //@line 2967
         break;
        }
       }
       $592 = _sbrk($$$i | 0) | 0; //@line 2971
       if (($592 | 0) == ($572 | 0)) {
        $$723947$i = $$$i; //@line 2974
        $$748$i = $572; //@line 2974
        label = 180; //@line 2975
        break L244;
       } else {
        $$2247$ph$i = $592; //@line 2978
        $$2253$ph$i = $$$i; //@line 2978
        label = 171; //@line 2979
       }
      } else {
       $$2234243136$i = 0; //@line 2982
      }
     }
    }
   } while (0);
   do {
    if ((label | 0) == 171) {
     $603 = 0 - $$2253$ph$i | 0; //@line 2989
     if (!($545 >>> 0 > $$2253$ph$i >>> 0 & ($$2253$ph$i >>> 0 < 2147483647 & ($$2247$ph$i | 0) != (-1 | 0)))) {
      if (($$2247$ph$i | 0) == (-1 | 0)) {
       $$2234243136$i = 0; //@line 2998
       break;
      } else {
       $$723947$i = $$2253$ph$i; //@line 3001
       $$748$i = $$2247$ph$i; //@line 3001
       label = 180; //@line 3002
       break L244;
      }
     }
     $607 = HEAP32[1125] | 0; //@line 3006
     $611 = $546 - $$2253$ph$i + $607 & 0 - $607; //@line 3010
     if ($611 >>> 0 >= 2147483647) {
      $$723947$i = $$2253$ph$i; //@line 3013
      $$748$i = $$2247$ph$i; //@line 3013
      label = 180; //@line 3014
      break L244;
     }
     if ((_sbrk($611 | 0) | 0) == (-1 | 0)) {
      _sbrk($603 | 0) | 0; //@line 3020
      $$2234243136$i = 0; //@line 3021
      break;
     } else {
      $$723947$i = $611 + $$2253$ph$i | 0; //@line 3025
      $$748$i = $$2247$ph$i; //@line 3025
      label = 180; //@line 3026
      break L244;
     }
    }
   } while (0);
   HEAP32[1116] = HEAP32[1116] | 4; //@line 3033
   $$4236$i = $$2234243136$i; //@line 3034
   label = 178; //@line 3035
  } else {
   $$4236$i = 0; //@line 3037
   label = 178; //@line 3038
  }
 } while (0);
 if ((label | 0) == 178) {
  if ($550 >>> 0 < 2147483647) {
   $620 = _sbrk($550 | 0) | 0; //@line 3044
   $621 = _sbrk(0) | 0; //@line 3045
   $627 = $621 - $620 | 0; //@line 3053
   $629 = $627 >>> 0 > ($$0197 + 40 | 0) >>> 0; //@line 3055
   if (!(($620 | 0) == (-1 | 0) | $629 ^ 1 | $620 >>> 0 < $621 >>> 0 & (($620 | 0) != (-1 | 0) & ($621 | 0) != (-1 | 0)) ^ 1)) {
    $$723947$i = $629 ? $627 : $$4236$i; //@line 3063
    $$748$i = $620; //@line 3063
    label = 180; //@line 3064
   }
  }
 }
 if ((label | 0) == 180) {
  $633 = (HEAP32[1113] | 0) + $$723947$i | 0; //@line 3070
  HEAP32[1113] = $633; //@line 3071
  if ($633 >>> 0 > (HEAP32[1114] | 0) >>> 0) {
   HEAP32[1114] = $633; //@line 3075
  }
  $636 = HEAP32[1011] | 0; //@line 3077
  do {
   if (!$636) {
    $638 = HEAP32[1009] | 0; //@line 3081
    if (($638 | 0) == 0 | $$748$i >>> 0 < $638 >>> 0) {
     HEAP32[1009] = $$748$i; //@line 3086
    }
    HEAP32[1117] = $$748$i; //@line 3088
    HEAP32[1118] = $$723947$i; //@line 3089
    HEAP32[1120] = 0; //@line 3090
    HEAP32[1014] = HEAP32[1123]; //@line 3092
    HEAP32[1013] = -1; //@line 3093
    HEAP32[1018] = 4060; //@line 3094
    HEAP32[1017] = 4060; //@line 3095
    HEAP32[1020] = 4068; //@line 3096
    HEAP32[1019] = 4068; //@line 3097
    HEAP32[1022] = 4076; //@line 3098
    HEAP32[1021] = 4076; //@line 3099
    HEAP32[1024] = 4084; //@line 3100
    HEAP32[1023] = 4084; //@line 3101
    HEAP32[1026] = 4092; //@line 3102
    HEAP32[1025] = 4092; //@line 3103
    HEAP32[1028] = 4100; //@line 3104
    HEAP32[1027] = 4100; //@line 3105
    HEAP32[1030] = 4108; //@line 3106
    HEAP32[1029] = 4108; //@line 3107
    HEAP32[1032] = 4116; //@line 3108
    HEAP32[1031] = 4116; //@line 3109
    HEAP32[1034] = 4124; //@line 3110
    HEAP32[1033] = 4124; //@line 3111
    HEAP32[1036] = 4132; //@line 3112
    HEAP32[1035] = 4132; //@line 3113
    HEAP32[1038] = 4140; //@line 3114
    HEAP32[1037] = 4140; //@line 3115
    HEAP32[1040] = 4148; //@line 3116
    HEAP32[1039] = 4148; //@line 3117
    HEAP32[1042] = 4156; //@line 3118
    HEAP32[1041] = 4156; //@line 3119
    HEAP32[1044] = 4164; //@line 3120
    HEAP32[1043] = 4164; //@line 3121
    HEAP32[1046] = 4172; //@line 3122
    HEAP32[1045] = 4172; //@line 3123
    HEAP32[1048] = 4180; //@line 3124
    HEAP32[1047] = 4180; //@line 3125
    HEAP32[1050] = 4188; //@line 3126
    HEAP32[1049] = 4188; //@line 3127
    HEAP32[1052] = 4196; //@line 3128
    HEAP32[1051] = 4196; //@line 3129
    HEAP32[1054] = 4204; //@line 3130
    HEAP32[1053] = 4204; //@line 3131
    HEAP32[1056] = 4212; //@line 3132
    HEAP32[1055] = 4212; //@line 3133
    HEAP32[1058] = 4220; //@line 3134
    HEAP32[1057] = 4220; //@line 3135
    HEAP32[1060] = 4228; //@line 3136
    HEAP32[1059] = 4228; //@line 3137
    HEAP32[1062] = 4236; //@line 3138
    HEAP32[1061] = 4236; //@line 3139
    HEAP32[1064] = 4244; //@line 3140
    HEAP32[1063] = 4244; //@line 3141
    HEAP32[1066] = 4252; //@line 3142
    HEAP32[1065] = 4252; //@line 3143
    HEAP32[1068] = 4260; //@line 3144
    HEAP32[1067] = 4260; //@line 3145
    HEAP32[1070] = 4268; //@line 3146
    HEAP32[1069] = 4268; //@line 3147
    HEAP32[1072] = 4276; //@line 3148
    HEAP32[1071] = 4276; //@line 3149
    HEAP32[1074] = 4284; //@line 3150
    HEAP32[1073] = 4284; //@line 3151
    HEAP32[1076] = 4292; //@line 3152
    HEAP32[1075] = 4292; //@line 3153
    HEAP32[1078] = 4300; //@line 3154
    HEAP32[1077] = 4300; //@line 3155
    HEAP32[1080] = 4308; //@line 3156
    HEAP32[1079] = 4308; //@line 3157
    $642 = $$723947$i + -40 | 0; //@line 3158
    $644 = $$748$i + 8 | 0; //@line 3160
    $649 = ($644 & 7 | 0) == 0 ? 0 : 0 - $644 & 7; //@line 3165
    $650 = $$748$i + $649 | 0; //@line 3166
    $651 = $642 - $649 | 0; //@line 3167
    HEAP32[1011] = $650; //@line 3168
    HEAP32[1008] = $651; //@line 3169
    HEAP32[$650 + 4 >> 2] = $651 | 1; //@line 3172
    HEAP32[$$748$i + $642 + 4 >> 2] = 40; //@line 3175
    HEAP32[1012] = HEAP32[1127]; //@line 3177
   } else {
    $$024367$i = 4468; //@line 3179
    while (1) {
     $657 = HEAP32[$$024367$i >> 2] | 0; //@line 3181
     $658 = $$024367$i + 4 | 0; //@line 3182
     $659 = HEAP32[$658 >> 2] | 0; //@line 3183
     if (($$748$i | 0) == ($657 + $659 | 0)) {
      label = 188; //@line 3187
      break;
     }
     $663 = HEAP32[$$024367$i + 8 >> 2] | 0; //@line 3191
     if (!$663) {
      break;
     } else {
      $$024367$i = $663; //@line 3196
     }
    }
    if ((label | 0) == 188) {
     if (!(HEAP32[$$024367$i + 12 >> 2] & 8)) {
      if ($$748$i >>> 0 > $636 >>> 0 & $657 >>> 0 <= $636 >>> 0) {
       HEAP32[$658 >> 2] = $659 + $$723947$i; //@line 3210
       $673 = (HEAP32[1008] | 0) + $$723947$i | 0; //@line 3212
       $675 = $636 + 8 | 0; //@line 3214
       $680 = ($675 & 7 | 0) == 0 ? 0 : 0 - $675 & 7; //@line 3219
       $681 = $636 + $680 | 0; //@line 3220
       $682 = $673 - $680 | 0; //@line 3221
       HEAP32[1011] = $681; //@line 3222
       HEAP32[1008] = $682; //@line 3223
       HEAP32[$681 + 4 >> 2] = $682 | 1; //@line 3226
       HEAP32[$636 + $673 + 4 >> 2] = 40; //@line 3229
       HEAP32[1012] = HEAP32[1127]; //@line 3231
       break;
      }
     }
    }
    $688 = HEAP32[1009] | 0; //@line 3236
    if ($$748$i >>> 0 < $688 >>> 0) {
     HEAP32[1009] = $$748$i; //@line 3239
     $753 = $$748$i; //@line 3240
    } else {
     $753 = $688; //@line 3242
    }
    $690 = $$748$i + $$723947$i | 0; //@line 3244
    $$124466$i = 4468; //@line 3245
    while (1) {
     if ((HEAP32[$$124466$i >> 2] | 0) == ($690 | 0)) {
      label = 196; //@line 3250
      break;
     }
     $694 = HEAP32[$$124466$i + 8 >> 2] | 0; //@line 3254
     if (!$694) {
      $$0$i$i$i = 4468; //@line 3257
      break;
     } else {
      $$124466$i = $694; //@line 3260
     }
    }
    if ((label | 0) == 196) {
     if (!(HEAP32[$$124466$i + 12 >> 2] & 8)) {
      HEAP32[$$124466$i >> 2] = $$748$i; //@line 3269
      $700 = $$124466$i + 4 | 0; //@line 3270
      HEAP32[$700 >> 2] = (HEAP32[$700 >> 2] | 0) + $$723947$i; //@line 3273
      $704 = $$748$i + 8 | 0; //@line 3275
      $710 = $$748$i + (($704 & 7 | 0) == 0 ? 0 : 0 - $704 & 7) | 0; //@line 3281
      $712 = $690 + 8 | 0; //@line 3283
      $718 = $690 + (($712 & 7 | 0) == 0 ? 0 : 0 - $712 & 7) | 0; //@line 3289
      $722 = $710 + $$0197 | 0; //@line 3293
      $723 = $718 - $710 - $$0197 | 0; //@line 3294
      HEAP32[$710 + 4 >> 2] = $$0197 | 3; //@line 3297
      do {
       if (($636 | 0) == ($718 | 0)) {
        $728 = (HEAP32[1008] | 0) + $723 | 0; //@line 3302
        HEAP32[1008] = $728; //@line 3303
        HEAP32[1011] = $722; //@line 3304
        HEAP32[$722 + 4 >> 2] = $728 | 1; //@line 3307
       } else {
        if ((HEAP32[1010] | 0) == ($718 | 0)) {
         $734 = (HEAP32[1007] | 0) + $723 | 0; //@line 3313
         HEAP32[1007] = $734; //@line 3314
         HEAP32[1010] = $722; //@line 3315
         HEAP32[$722 + 4 >> 2] = $734 | 1; //@line 3318
         HEAP32[$722 + $734 >> 2] = $734; //@line 3320
         break;
        }
        $739 = HEAP32[$718 + 4 >> 2] | 0; //@line 3324
        if (($739 & 3 | 0) == 1) {
         $742 = $739 & -8; //@line 3328
         $743 = $739 >>> 3; //@line 3329
         L311 : do {
          if ($739 >>> 0 < 256) {
           $746 = HEAP32[$718 + 8 >> 2] | 0; //@line 3334
           $748 = HEAP32[$718 + 12 >> 2] | 0; //@line 3336
           $750 = 4060 + ($743 << 1 << 2) | 0; //@line 3338
           do {
            if (($746 | 0) != ($750 | 0)) {
             if ($753 >>> 0 > $746 >>> 0) {
              _abort(); //@line 3344
             }
             if ((HEAP32[$746 + 12 >> 2] | 0) == ($718 | 0)) {
              break;
             }
             _abort(); //@line 3353
            }
           } while (0);
           if (($748 | 0) == ($746 | 0)) {
            HEAP32[1005] = HEAP32[1005] & ~(1 << $743); //@line 3363
            break;
           }
           do {
            if (($748 | 0) == ($750 | 0)) {
             $$pre$phi11$i$iZ2D = $748 + 8 | 0; //@line 3370
            } else {
             if ($753 >>> 0 > $748 >>> 0) {
              _abort(); //@line 3374
             }
             $764 = $748 + 8 | 0; //@line 3377
             if ((HEAP32[$764 >> 2] | 0) == ($718 | 0)) {
              $$pre$phi11$i$iZ2D = $764; //@line 3381
              break;
             }
             _abort(); //@line 3384
            }
           } while (0);
           HEAP32[$746 + 12 >> 2] = $748; //@line 3389
           HEAP32[$$pre$phi11$i$iZ2D >> 2] = $746; //@line 3390
          } else {
           $769 = HEAP32[$718 + 24 >> 2] | 0; //@line 3393
           $771 = HEAP32[$718 + 12 >> 2] | 0; //@line 3395
           do {
            if (($771 | 0) == ($718 | 0)) {
             $782 = $718 + 16 | 0; //@line 3399
             $783 = $782 + 4 | 0; //@line 3400
             $784 = HEAP32[$783 >> 2] | 0; //@line 3401
             if (!$784) {
              $786 = HEAP32[$782 >> 2] | 0; //@line 3404
              if (!$786) {
               $$3$i$i = 0; //@line 3407
               break;
              } else {
               $$1291$i$i = $786; //@line 3410
               $$1293$i$i = $782; //@line 3410
              }
             } else {
              $$1291$i$i = $784; //@line 3413
              $$1293$i$i = $783; //@line 3413
             }
             while (1) {
              $788 = $$1291$i$i + 20 | 0; //@line 3416
              $789 = HEAP32[$788 >> 2] | 0; //@line 3417
              if ($789 | 0) {
               $$1291$i$i = $789; //@line 3420
               $$1293$i$i = $788; //@line 3420
               continue;
              }
              $791 = $$1291$i$i + 16 | 0; //@line 3423
              $792 = HEAP32[$791 >> 2] | 0; //@line 3424
              if (!$792) {
               break;
              } else {
               $$1291$i$i = $792; //@line 3429
               $$1293$i$i = $791; //@line 3429
              }
             }
             if ($753 >>> 0 > $$1293$i$i >>> 0) {
              _abort(); //@line 3434
             } else {
              HEAP32[$$1293$i$i >> 2] = 0; //@line 3437
              $$3$i$i = $$1291$i$i; //@line 3438
              break;
             }
            } else {
             $774 = HEAP32[$718 + 8 >> 2] | 0; //@line 3443
             if ($753 >>> 0 > $774 >>> 0) {
              _abort(); //@line 3446
             }
             $776 = $774 + 12 | 0; //@line 3449
             if ((HEAP32[$776 >> 2] | 0) != ($718 | 0)) {
              _abort(); //@line 3453
             }
             $779 = $771 + 8 | 0; //@line 3456
             if ((HEAP32[$779 >> 2] | 0) == ($718 | 0)) {
              HEAP32[$776 >> 2] = $771; //@line 3460
              HEAP32[$779 >> 2] = $774; //@line 3461
              $$3$i$i = $771; //@line 3462
              break;
             } else {
              _abort(); //@line 3465
             }
            }
           } while (0);
           if (!$769) {
            break;
           }
           $797 = HEAP32[$718 + 28 >> 2] | 0; //@line 3475
           $798 = 4324 + ($797 << 2) | 0; //@line 3476
           do {
            if ((HEAP32[$798 >> 2] | 0) == ($718 | 0)) {
             HEAP32[$798 >> 2] = $$3$i$i; //@line 3481
             if ($$3$i$i | 0) {
              break;
             }
             HEAP32[1006] = HEAP32[1006] & ~(1 << $797); //@line 3490
             break L311;
            } else {
             if ((HEAP32[1009] | 0) >>> 0 > $769 >>> 0) {
              _abort(); //@line 3496
             } else {
              HEAP32[$769 + 16 + (((HEAP32[$769 + 16 >> 2] | 0) != ($718 | 0) & 1) << 2) >> 2] = $$3$i$i; //@line 3504
              if (!$$3$i$i) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while (0);
           $812 = HEAP32[1009] | 0; //@line 3514
           if ($812 >>> 0 > $$3$i$i >>> 0) {
            _abort(); //@line 3517
           }
           HEAP32[$$3$i$i + 24 >> 2] = $769; //@line 3521
           $815 = $718 + 16 | 0; //@line 3522
           $816 = HEAP32[$815 >> 2] | 0; //@line 3523
           do {
            if ($816 | 0) {
             if ($812 >>> 0 > $816 >>> 0) {
              _abort(); //@line 3529
             } else {
              HEAP32[$$3$i$i + 16 >> 2] = $816; //@line 3533
              HEAP32[$816 + 24 >> 2] = $$3$i$i; //@line 3535
              break;
             }
            }
           } while (0);
           $822 = HEAP32[$815 + 4 >> 2] | 0; //@line 3541
           if (!$822) {
            break;
           }
           if ((HEAP32[1009] | 0) >>> 0 > $822 >>> 0) {
            _abort(); //@line 3549
           } else {
            HEAP32[$$3$i$i + 20 >> 2] = $822; //@line 3553
            HEAP32[$822 + 24 >> 2] = $$3$i$i; //@line 3555
            break;
           }
          }
         } while (0);
         $$0$i17$i = $718 + $742 | 0; //@line 3562
         $$0287$i$i = $742 + $723 | 0; //@line 3562
        } else {
         $$0$i17$i = $718; //@line 3564
         $$0287$i$i = $723; //@line 3564
        }
        $830 = $$0$i17$i + 4 | 0; //@line 3566
        HEAP32[$830 >> 2] = HEAP32[$830 >> 2] & -2; //@line 3569
        HEAP32[$722 + 4 >> 2] = $$0287$i$i | 1; //@line 3572
        HEAP32[$722 + $$0287$i$i >> 2] = $$0287$i$i; //@line 3574
        $836 = $$0287$i$i >>> 3; //@line 3575
        if ($$0287$i$i >>> 0 < 256) {
         $839 = 4060 + ($836 << 1 << 2) | 0; //@line 3579
         $840 = HEAP32[1005] | 0; //@line 3580
         $841 = 1 << $836; //@line 3581
         do {
          if (!($840 & $841)) {
           HEAP32[1005] = $840 | $841; //@line 3587
           $$0295$i$i = $839; //@line 3589
           $$pre$phi$i19$iZ2D = $839 + 8 | 0; //@line 3589
          } else {
           $845 = $839 + 8 | 0; //@line 3591
           $846 = HEAP32[$845 >> 2] | 0; //@line 3592
           if ((HEAP32[1009] | 0) >>> 0 <= $846 >>> 0) {
            $$0295$i$i = $846; //@line 3596
            $$pre$phi$i19$iZ2D = $845; //@line 3596
            break;
           }
           _abort(); //@line 3599
          }
         } while (0);
         HEAP32[$$pre$phi$i19$iZ2D >> 2] = $722; //@line 3603
         HEAP32[$$0295$i$i + 12 >> 2] = $722; //@line 3605
         HEAP32[$722 + 8 >> 2] = $$0295$i$i; //@line 3607
         HEAP32[$722 + 12 >> 2] = $839; //@line 3609
         break;
        }
        $852 = $$0287$i$i >>> 8; //@line 3612
        do {
         if (!$852) {
          $$0296$i$i = 0; //@line 3616
         } else {
          if ($$0287$i$i >>> 0 > 16777215) {
           $$0296$i$i = 31; //@line 3620
           break;
          }
          $857 = ($852 + 1048320 | 0) >>> 16 & 8; //@line 3625
          $858 = $852 << $857; //@line 3626
          $861 = ($858 + 520192 | 0) >>> 16 & 4; //@line 3629
          $863 = $858 << $861; //@line 3631
          $866 = ($863 + 245760 | 0) >>> 16 & 2; //@line 3634
          $871 = 14 - ($861 | $857 | $866) + ($863 << $866 >>> 15) | 0; //@line 3639
          $$0296$i$i = $$0287$i$i >>> ($871 + 7 | 0) & 1 | $871 << 1; //@line 3645
         }
        } while (0);
        $877 = 4324 + ($$0296$i$i << 2) | 0; //@line 3648
        HEAP32[$722 + 28 >> 2] = $$0296$i$i; //@line 3650
        $879 = $722 + 16 | 0; //@line 3651
        HEAP32[$879 + 4 >> 2] = 0; //@line 3653
        HEAP32[$879 >> 2] = 0; //@line 3654
        $881 = HEAP32[1006] | 0; //@line 3655
        $882 = 1 << $$0296$i$i; //@line 3656
        if (!($881 & $882)) {
         HEAP32[1006] = $881 | $882; //@line 3661
         HEAP32[$877 >> 2] = $722; //@line 3662
         HEAP32[$722 + 24 >> 2] = $877; //@line 3664
         HEAP32[$722 + 12 >> 2] = $722; //@line 3666
         HEAP32[$722 + 8 >> 2] = $722; //@line 3668
         break;
        }
        $$0288$i$i = $$0287$i$i << (($$0296$i$i | 0) == 31 ? 0 : 25 - ($$0296$i$i >>> 1) | 0); //@line 3677
        $$0289$i$i = HEAP32[$877 >> 2] | 0; //@line 3677
        while (1) {
         if ((HEAP32[$$0289$i$i + 4 >> 2] & -8 | 0) == ($$0287$i$i | 0)) {
          label = 263; //@line 3684
          break;
         }
         $900 = $$0289$i$i + 16 + ($$0288$i$i >>> 31 << 2) | 0; //@line 3688
         $902 = HEAP32[$900 >> 2] | 0; //@line 3690
         if (!$902) {
          label = 260; //@line 3693
          break;
         } else {
          $$0288$i$i = $$0288$i$i << 1; //@line 3696
          $$0289$i$i = $902; //@line 3696
         }
        }
        if ((label | 0) == 260) {
         if ((HEAP32[1009] | 0) >>> 0 > $900 >>> 0) {
          _abort(); //@line 3703
         } else {
          HEAP32[$900 >> 2] = $722; //@line 3706
          HEAP32[$722 + 24 >> 2] = $$0289$i$i; //@line 3708
          HEAP32[$722 + 12 >> 2] = $722; //@line 3710
          HEAP32[$722 + 8 >> 2] = $722; //@line 3712
          break;
         }
        } else if ((label | 0) == 263) {
         $909 = $$0289$i$i + 8 | 0; //@line 3717
         $910 = HEAP32[$909 >> 2] | 0; //@line 3718
         $911 = HEAP32[1009] | 0; //@line 3719
         if ($911 >>> 0 <= $910 >>> 0 & $911 >>> 0 <= $$0289$i$i >>> 0) {
          HEAP32[$910 + 12 >> 2] = $722; //@line 3725
          HEAP32[$909 >> 2] = $722; //@line 3726
          HEAP32[$722 + 8 >> 2] = $910; //@line 3728
          HEAP32[$722 + 12 >> 2] = $$0289$i$i; //@line 3730
          HEAP32[$722 + 24 >> 2] = 0; //@line 3732
          break;
         } else {
          _abort(); //@line 3735
         }
        }
       }
      } while (0);
      $$0 = $710 + 8 | 0; //@line 3742
      STACKTOP = sp; //@line 3743
      return $$0 | 0; //@line 3743
     } else {
      $$0$i$i$i = 4468; //@line 3745
     }
    }
    while (1) {
     $919 = HEAP32[$$0$i$i$i >> 2] | 0; //@line 3749
     if ($919 >>> 0 <= $636 >>> 0) {
      $923 = $919 + (HEAP32[$$0$i$i$i + 4 >> 2] | 0) | 0; //@line 3754
      if ($923 >>> 0 > $636 >>> 0) {
       break;
      }
     }
     $$0$i$i$i = HEAP32[$$0$i$i$i + 8 >> 2] | 0; //@line 3762
    }
    $927 = $923 + -47 | 0; //@line 3764
    $929 = $927 + 8 | 0; //@line 3766
    $935 = $927 + (($929 & 7 | 0) == 0 ? 0 : 0 - $929 & 7) | 0; //@line 3772
    $936 = $636 + 16 | 0; //@line 3773
    $938 = $935 >>> 0 < $936 >>> 0 ? $636 : $935; //@line 3775
    $939 = $938 + 8 | 0; //@line 3776
    $940 = $938 + 24 | 0; //@line 3777
    $941 = $$723947$i + -40 | 0; //@line 3778
    $943 = $$748$i + 8 | 0; //@line 3780
    $948 = ($943 & 7 | 0) == 0 ? 0 : 0 - $943 & 7; //@line 3785
    $949 = $$748$i + $948 | 0; //@line 3786
    $950 = $941 - $948 | 0; //@line 3787
    HEAP32[1011] = $949; //@line 3788
    HEAP32[1008] = $950; //@line 3789
    HEAP32[$949 + 4 >> 2] = $950 | 1; //@line 3792
    HEAP32[$$748$i + $941 + 4 >> 2] = 40; //@line 3795
    HEAP32[1012] = HEAP32[1127]; //@line 3797
    $956 = $938 + 4 | 0; //@line 3798
    HEAP32[$956 >> 2] = 27; //@line 3799
    HEAP32[$939 >> 2] = HEAP32[1117]; //@line 3800
    HEAP32[$939 + 4 >> 2] = HEAP32[1118]; //@line 3800
    HEAP32[$939 + 8 >> 2] = HEAP32[1119]; //@line 3800
    HEAP32[$939 + 12 >> 2] = HEAP32[1120]; //@line 3800
    HEAP32[1117] = $$748$i; //@line 3801
    HEAP32[1118] = $$723947$i; //@line 3802
    HEAP32[1120] = 0; //@line 3803
    HEAP32[1119] = $939; //@line 3804
    $958 = $940; //@line 3805
    do {
     $958$looptemp = $958;
     $958 = $958 + 4 | 0; //@line 3807
     HEAP32[$958 >> 2] = 7; //@line 3808
    } while (($958$looptemp + 8 | 0) >>> 0 < $923 >>> 0);
    if (($938 | 0) != ($636 | 0)) {
     $964 = $938 - $636 | 0; //@line 3821
     HEAP32[$956 >> 2] = HEAP32[$956 >> 2] & -2; //@line 3824
     HEAP32[$636 + 4 >> 2] = $964 | 1; //@line 3827
     HEAP32[$938 >> 2] = $964; //@line 3828
     $969 = $964 >>> 3; //@line 3829
     if ($964 >>> 0 < 256) {
      $972 = 4060 + ($969 << 1 << 2) | 0; //@line 3833
      $973 = HEAP32[1005] | 0; //@line 3834
      $974 = 1 << $969; //@line 3835
      if (!($973 & $974)) {
       HEAP32[1005] = $973 | $974; //@line 3840
       $$0211$i$i = $972; //@line 3842
       $$pre$phi$i$iZ2D = $972 + 8 | 0; //@line 3842
      } else {
       $978 = $972 + 8 | 0; //@line 3844
       $979 = HEAP32[$978 >> 2] | 0; //@line 3845
       if ((HEAP32[1009] | 0) >>> 0 > $979 >>> 0) {
        _abort(); //@line 3849
       } else {
        $$0211$i$i = $979; //@line 3852
        $$pre$phi$i$iZ2D = $978; //@line 3852
       }
      }
      HEAP32[$$pre$phi$i$iZ2D >> 2] = $636; //@line 3855
      HEAP32[$$0211$i$i + 12 >> 2] = $636; //@line 3857
      HEAP32[$636 + 8 >> 2] = $$0211$i$i; //@line 3859
      HEAP32[$636 + 12 >> 2] = $972; //@line 3861
      break;
     }
     $985 = $964 >>> 8; //@line 3864
     if (!$985) {
      $$0212$i$i = 0; //@line 3867
     } else {
      if ($964 >>> 0 > 16777215) {
       $$0212$i$i = 31; //@line 3871
      } else {
       $990 = ($985 + 1048320 | 0) >>> 16 & 8; //@line 3875
       $991 = $985 << $990; //@line 3876
       $994 = ($991 + 520192 | 0) >>> 16 & 4; //@line 3879
       $996 = $991 << $994; //@line 3881
       $999 = ($996 + 245760 | 0) >>> 16 & 2; //@line 3884
       $1004 = 14 - ($994 | $990 | $999) + ($996 << $999 >>> 15) | 0; //@line 3889
       $$0212$i$i = $964 >>> ($1004 + 7 | 0) & 1 | $1004 << 1; //@line 3895
      }
     }
     $1010 = 4324 + ($$0212$i$i << 2) | 0; //@line 3898
     HEAP32[$636 + 28 >> 2] = $$0212$i$i; //@line 3900
     HEAP32[$636 + 20 >> 2] = 0; //@line 3902
     HEAP32[$936 >> 2] = 0; //@line 3903
     $1013 = HEAP32[1006] | 0; //@line 3904
     $1014 = 1 << $$0212$i$i; //@line 3905
     if (!($1013 & $1014)) {
      HEAP32[1006] = $1013 | $1014; //@line 3910
      HEAP32[$1010 >> 2] = $636; //@line 3911
      HEAP32[$636 + 24 >> 2] = $1010; //@line 3913
      HEAP32[$636 + 12 >> 2] = $636; //@line 3915
      HEAP32[$636 + 8 >> 2] = $636; //@line 3917
      break;
     }
     $$0206$i$i = $964 << (($$0212$i$i | 0) == 31 ? 0 : 25 - ($$0212$i$i >>> 1) | 0); //@line 3926
     $$0207$i$i = HEAP32[$1010 >> 2] | 0; //@line 3926
     while (1) {
      if ((HEAP32[$$0207$i$i + 4 >> 2] & -8 | 0) == ($964 | 0)) {
       label = 289; //@line 3933
       break;
      }
      $1032 = $$0207$i$i + 16 + ($$0206$i$i >>> 31 << 2) | 0; //@line 3937
      $1034 = HEAP32[$1032 >> 2] | 0; //@line 3939
      if (!$1034) {
       label = 286; //@line 3942
       break;
      } else {
       $$0206$i$i = $$0206$i$i << 1; //@line 3945
       $$0207$i$i = $1034; //@line 3945
      }
     }
     if ((label | 0) == 286) {
      if ((HEAP32[1009] | 0) >>> 0 > $1032 >>> 0) {
       _abort(); //@line 3952
      } else {
       HEAP32[$1032 >> 2] = $636; //@line 3955
       HEAP32[$636 + 24 >> 2] = $$0207$i$i; //@line 3957
       HEAP32[$636 + 12 >> 2] = $636; //@line 3959
       HEAP32[$636 + 8 >> 2] = $636; //@line 3961
       break;
      }
     } else if ((label | 0) == 289) {
      $1041 = $$0207$i$i + 8 | 0; //@line 3966
      $1042 = HEAP32[$1041 >> 2] | 0; //@line 3967
      $1043 = HEAP32[1009] | 0; //@line 3968
      if ($1043 >>> 0 <= $1042 >>> 0 & $1043 >>> 0 <= $$0207$i$i >>> 0) {
       HEAP32[$1042 + 12 >> 2] = $636; //@line 3974
       HEAP32[$1041 >> 2] = $636; //@line 3975
       HEAP32[$636 + 8 >> 2] = $1042; //@line 3977
       HEAP32[$636 + 12 >> 2] = $$0207$i$i; //@line 3979
       HEAP32[$636 + 24 >> 2] = 0; //@line 3981
       break;
      } else {
       _abort(); //@line 3984
      }
     }
    }
   }
  } while (0);
  $1052 = HEAP32[1008] | 0; //@line 3991
  if ($1052 >>> 0 > $$0197 >>> 0) {
   $1054 = $1052 - $$0197 | 0; //@line 3994
   HEAP32[1008] = $1054; //@line 3995
   $1055 = HEAP32[1011] | 0; //@line 3996
   $1056 = $1055 + $$0197 | 0; //@line 3997
   HEAP32[1011] = $1056; //@line 3998
   HEAP32[$1056 + 4 >> 2] = $1054 | 1; //@line 4001
   HEAP32[$1055 + 4 >> 2] = $$0197 | 3; //@line 4004
   $$0 = $1055 + 8 | 0; //@line 4006
   STACKTOP = sp; //@line 4007
   return $$0 | 0; //@line 4007
  }
 }
 HEAP32[(___errno_location() | 0) >> 2] = 12; //@line 4011
 $$0 = 0; //@line 4012
 STACKTOP = sp; //@line 4013
 return $$0 | 0; //@line 4013
}
function _fmt_fp($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = +$1;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $$$3484 = 0, $$$3484700 = 0, $$$4502 = 0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488655 = 0, $$0488657 = 0, $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$5605 = 0, $$561 = 0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa675 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre693 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $101 = 0, $104 = 0, $106 = 0, $11 = 0, $113 = 0, $116 = 0, $124 = 0, $125 = 0, $128 = 0, $130 = 0, $131 = 0, $132 = 0, $138 = 0, $140 = 0, $144 = 0, $149 = 0, $150 = 0, $151 = 0, $152 = 0, $154 = 0, $160 = 0, $161 = 0, $162 = 0, $174 = 0, $185 = 0, $189 = 0, $190 = 0, $193 = 0, $198 = 0, $199 = 0, $201 = 0, $209 = 0, $212 = 0, $213 = 0, $215 = 0, $217 = 0, $218 = 0, $221 = 0, $225 = 0, $230 = 0, $233 = 0, $236 = 0, $238 = 0, $240 = 0, $242 = 0, $247 = 0, $248 = 0, $251 = 0, $253 = 0, $256 = 0, $259 = 0, $267 = 0, $27 = 0, $270 = 0, $275 = 0, $284 = 0, $285 = 0, $289 = 0, $292 = 0, $294 = 0, $296 = 0, $300 = 0, $303 = 0, $304 = 0, $308 = 0, $31 = 0, $318 = 0, $323 = 0, $326 = 0, $327 = 0, $328 = 0, $330 = 0, $335 = 0, $347 = 0, $35 = 0.0, $351 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $369 = 0, $373 = 0, $375 = 0, $378 = 0, $381 = 0, $39 = 0, $41 = 0, $44 = 0, $46 = 0, $6 = 0, $60 = 0, $63 = 0, $66 = 0, $68 = 0, $7 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 7735
 STACKTOP = STACKTOP + 560 | 0; //@line 7736
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(560); //@line 7736
 $6 = sp + 8 | 0; //@line 7737
 $7 = sp; //@line 7738
 $8 = sp + 524 | 0; //@line 7739
 $9 = $8; //@line 7740
 $10 = sp + 512 | 0; //@line 7741
 HEAP32[$7 >> 2] = 0; //@line 7742
 $11 = $10 + 12 | 0; //@line 7743
 ___DOUBLE_BITS_677($1) | 0; //@line 7744
 if ((tempRet0 | 0) < 0) {
  $$0471 = -$1; //@line 7749
  $$0520 = 1; //@line 7749
  $$0521 = 1873; //@line 7749
 } else {
  $$0471 = $1; //@line 7760
  $$0520 = ($4 & 2049 | 0) != 0 & 1; //@line 7760
  $$0521 = ($4 & 2048 | 0) == 0 ? ($4 & 1 | 0) == 0 ? 1874 : 1879 : 1876; //@line 7760
 }
 ___DOUBLE_BITS_677($$0471) | 0; //@line 7762
 do {
  if (0 == 0 & (tempRet0 & 2146435072 | 0) == 2146435072) {
   $27 = ($5 & 32 | 0) != 0; //@line 7771
   $31 = $$0520 + 3 | 0; //@line 7776
   _pad_676($0, 32, $2, $31, $4 & -65537); //@line 7778
   _out_670($0, $$0521, $$0520); //@line 7779
   _out_670($0, $$0471 != $$0471 | 0.0 != 0.0 ? $27 ? 1900 : 1904 : $27 ? 1892 : 1896, 3); //@line 7780
   _pad_676($0, 32, $2, $31, $4 ^ 8192); //@line 7782
   $$sink560 = $31; //@line 7783
  } else {
   $35 = +_frexpl($$0471, $7) * 2.0; //@line 7786
   $36 = $35 != 0.0; //@line 7787
   if ($36) {
    HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + -1; //@line 7791
   }
   $39 = $5 | 32; //@line 7793
   if (($39 | 0) == 97) {
    $41 = $5 & 32; //@line 7796
    $$0521$ = ($41 | 0) == 0 ? $$0521 : $$0521 + 9 | 0; //@line 7799
    $44 = $$0520 | 2; //@line 7800
    $46 = 12 - $3 | 0; //@line 7802
    do {
     if ($3 >>> 0 > 11 | ($46 | 0) == 0) {
      $$1472 = $35; //@line 7807
     } else {
      $$0509585 = 8.0; //@line 7809
      $$1508586 = $46; //@line 7809
      do {
       $$1508586 = $$1508586 + -1 | 0; //@line 7811
       $$0509585 = $$0509585 * 16.0; //@line 7812
      } while (($$1508586 | 0) != 0);
      if ((HEAP8[$$0521$ >> 0] | 0) == 45) {
       $$1472 = -($$0509585 + (-$35 - $$0509585)); //@line 7827
       break;
      } else {
       $$1472 = $35 + $$0509585 - $$0509585; //@line 7832
       break;
      }
     }
    } while (0);
    $60 = HEAP32[$7 >> 2] | 0; //@line 7837
    $63 = ($60 | 0) < 0 ? 0 - $60 | 0 : $60; //@line 7840
    $66 = _fmt_u($63, (($63 | 0) < 0) << 31 >> 31, $11) | 0; //@line 7843
    if (($66 | 0) == ($11 | 0)) {
     $68 = $10 + 11 | 0; //@line 7846
     HEAP8[$68 >> 0] = 48; //@line 7847
     $$0511 = $68; //@line 7848
    } else {
     $$0511 = $66; //@line 7850
    }
    HEAP8[$$0511 + -1 >> 0] = ($60 >> 31 & 2) + 43; //@line 7857
    $76 = $$0511 + -2 | 0; //@line 7860
    HEAP8[$76 >> 0] = $5 + 15; //@line 7861
    $77 = ($3 | 0) < 1; //@line 7862
    $79 = ($4 & 8 | 0) == 0; //@line 7864
    $$0523 = $8; //@line 7865
    $$2473 = $$1472; //@line 7865
    while (1) {
     $80 = ~~$$2473; //@line 7867
     $86 = $$0523 + 1 | 0; //@line 7873
     HEAP8[$$0523 >> 0] = $41 | HEAPU8[1908 + $80 >> 0]; //@line 7874
     $$2473 = ($$2473 - +($80 | 0)) * 16.0; //@line 7877
     if (($86 - $9 | 0) == 1) {
      if ($79 & ($77 & $$2473 == 0.0)) {
       $$1524 = $86; //@line 7886
      } else {
       HEAP8[$86 >> 0] = 46; //@line 7889
       $$1524 = $$0523 + 2 | 0; //@line 7890
      }
     } else {
      $$1524 = $86; //@line 7893
     }
     if (!($$2473 != 0.0)) {
      break;
     } else {
      $$0523 = $$1524; //@line 7897
     }
    }
    $$pre693 = $$1524; //@line 7903
    if (!$3) {
     label = 24; //@line 7905
    } else {
     if ((-2 - $9 + $$pre693 | 0) < ($3 | 0)) {
      $$pre$phi691Z2D = $$pre693 - $9 | 0; //@line 7913
      $$sink = $3 + 2 | 0; //@line 7913
     } else {
      label = 24; //@line 7915
     }
    }
    if ((label | 0) == 24) {
     $101 = $$pre693 - $9 | 0; //@line 7919
     $$pre$phi691Z2D = $101; //@line 7920
     $$sink = $101; //@line 7920
    }
    $104 = $11 - $76 | 0; //@line 7924
    $106 = $104 + $44 + $$sink | 0; //@line 7926
    _pad_676($0, 32, $2, $106, $4); //@line 7927
    _out_670($0, $$0521$, $44); //@line 7928
    _pad_676($0, 48, $2, $106, $4 ^ 65536); //@line 7930
    _out_670($0, $8, $$pre$phi691Z2D); //@line 7931
    _pad_676($0, 48, $$sink - $$pre$phi691Z2D | 0, 0, 0); //@line 7933
    _out_670($0, $76, $104); //@line 7934
    _pad_676($0, 32, $2, $106, $4 ^ 8192); //@line 7936
    $$sink560 = $106; //@line 7937
    break;
   }
   $$540 = ($3 | 0) < 0 ? 6 : $3; //@line 7941
   if ($36) {
    $113 = (HEAP32[$7 >> 2] | 0) + -28 | 0; //@line 7945
    HEAP32[$7 >> 2] = $113; //@line 7946
    $$3 = $35 * 268435456.0; //@line 7947
    $$pr = $113; //@line 7947
   } else {
    $$3 = $35; //@line 7950
    $$pr = HEAP32[$7 >> 2] | 0; //@line 7950
   }
   $$561 = ($$pr | 0) < 0 ? $6 : $6 + 288 | 0; //@line 7954
   $$0498 = $$561; //@line 7955
   $$4 = $$3; //@line 7955
   do {
    $116 = ~~$$4 >>> 0; //@line 7957
    HEAP32[$$0498 >> 2] = $116; //@line 7958
    $$0498 = $$0498 + 4 | 0; //@line 7959
    $$4 = ($$4 - +($116 >>> 0)) * 1.0e9; //@line 7962
   } while ($$4 != 0.0);
   if (($$pr | 0) > 0) {
    $$1482663 = $$561; //@line 7972
    $$1499662 = $$0498; //@line 7972
    $124 = $$pr; //@line 7972
    while (1) {
     $125 = ($124 | 0) < 29 ? $124 : 29; //@line 7975
     $$0488655 = $$1499662 + -4 | 0; //@line 7976
     if ($$0488655 >>> 0 < $$1482663 >>> 0) {
      $$2483$ph = $$1482663; //@line 7979
     } else {
      $$0488657 = $$0488655; //@line 7981
      $$0497656 = 0; //@line 7981
      do {
       $128 = _bitshift64Shl(HEAP32[$$0488657 >> 2] | 0, 0, $125 | 0) | 0; //@line 7984
       $130 = _i64Add($128 | 0, tempRet0 | 0, $$0497656 | 0, 0) | 0; //@line 7986
       $131 = tempRet0; //@line 7987
       $132 = ___uremdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 7988
       HEAP32[$$0488657 >> 2] = $132; //@line 7990
       $$0497656 = ___udivdi3($130 | 0, $131 | 0, 1e9, 0) | 0; //@line 7991
       $$0488657 = $$0488657 + -4 | 0; //@line 7993
      } while ($$0488657 >>> 0 >= $$1482663 >>> 0);
      if (!$$0497656) {
       $$2483$ph = $$1482663; //@line 8003
      } else {
       $138 = $$1482663 + -4 | 0; //@line 8005
       HEAP32[$138 >> 2] = $$0497656; //@line 8006
       $$2483$ph = $138; //@line 8007
      }
     }
     $$2500 = $$1499662; //@line 8010
     while (1) {
      if ($$2500 >>> 0 <= $$2483$ph >>> 0) {
       break;
      }
      $140 = $$2500 + -4 | 0; //@line 8016
      if (!(HEAP32[$140 >> 2] | 0)) {
       $$2500 = $140; //@line 8020
      } else {
       break;
      }
     }
     $144 = (HEAP32[$7 >> 2] | 0) - $125 | 0; //@line 8026
     HEAP32[$7 >> 2] = $144; //@line 8027
     if (($144 | 0) > 0) {
      $$1482663 = $$2483$ph; //@line 8030
      $$1499662 = $$2500; //@line 8030
      $124 = $144; //@line 8030
     } else {
      $$1482$lcssa = $$2483$ph; //@line 8032
      $$1499$lcssa = $$2500; //@line 8032
      $$pr566 = $144; //@line 8032
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561; //@line 8037
    $$1499$lcssa = $$0498; //@line 8037
    $$pr566 = $$pr; //@line 8037
   }
   if (($$pr566 | 0) < 0) {
    $149 = (($$540 + 25 | 0) / 9 | 0) + 1 | 0; //@line 8043
    $150 = ($39 | 0) == 102; //@line 8044
    $$3484650 = $$1482$lcssa; //@line 8045
    $$3501649 = $$1499$lcssa; //@line 8045
    $152 = $$pr566; //@line 8045
    while (1) {
     $151 = 0 - $152 | 0; //@line 8047
     $154 = ($151 | 0) < 9 ? $151 : 9; //@line 8049
     if ($$3484650 >>> 0 < $$3501649 >>> 0) {
      $160 = (1 << $154) + -1 | 0; //@line 8053
      $161 = 1e9 >>> $154; //@line 8054
      $$0487644 = 0; //@line 8055
      $$1489643 = $$3484650; //@line 8055
      do {
       $162 = HEAP32[$$1489643 >> 2] | 0; //@line 8057
       HEAP32[$$1489643 >> 2] = ($162 >>> $154) + $$0487644; //@line 8061
       $$0487644 = Math_imul($162 & $160, $161) | 0; //@line 8062
       $$1489643 = $$1489643 + 4 | 0; //@line 8063
      } while ($$1489643 >>> 0 < $$3501649 >>> 0);
      $$$3484 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8074
      if (!$$0487644) {
       $$$3484700 = $$$3484; //@line 8077
       $$4502 = $$3501649; //@line 8077
      } else {
       HEAP32[$$3501649 >> 2] = $$0487644; //@line 8080
       $$$3484700 = $$$3484; //@line 8081
       $$4502 = $$3501649 + 4 | 0; //@line 8081
      }
     } else {
      $$$3484700 = (HEAP32[$$3484650 >> 2] | 0) == 0 ? $$3484650 + 4 | 0 : $$3484650; //@line 8088
      $$4502 = $$3501649; //@line 8088
     }
     $174 = $150 ? $$561 : $$$3484700; //@line 8090
     $$$4502 = ($$4502 - $174 >> 2 | 0) > ($149 | 0) ? $174 + ($149 << 2) | 0 : $$4502; //@line 8097
     $152 = (HEAP32[$7 >> 2] | 0) + $154 | 0; //@line 8099
     HEAP32[$7 >> 2] = $152; //@line 8100
     if (($152 | 0) >= 0) {
      $$3484$lcssa = $$$3484700; //@line 8105
      $$3501$lcssa = $$$4502; //@line 8105
      break;
     } else {
      $$3484650 = $$$3484700; //@line 8103
      $$3501649 = $$$4502; //@line 8103
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa; //@line 8110
    $$3501$lcssa = $$1499$lcssa; //@line 8110
   }
   $185 = $$561; //@line 8113
   if ($$3484$lcssa >>> 0 < $$3501$lcssa >>> 0) {
    $189 = ($185 - $$3484$lcssa >> 2) * 9 | 0; //@line 8118
    $190 = HEAP32[$$3484$lcssa >> 2] | 0; //@line 8119
    if ($190 >>> 0 < 10) {
     $$1515 = $189; //@line 8122
    } else {
     $$0514639 = $189; //@line 8124
     $$0530638 = 10; //@line 8124
     while (1) {
      $$0530638 = $$0530638 * 10 | 0; //@line 8126
      $193 = $$0514639 + 1 | 0; //@line 8127
      if ($190 >>> 0 < $$0530638 >>> 0) {
       $$1515 = $193; //@line 8130
       break;
      } else {
       $$0514639 = $193; //@line 8133
      }
     }
    }
   } else {
    $$1515 = 0; //@line 8138
   }
   $198 = ($39 | 0) == 103; //@line 8143
   $199 = ($$540 | 0) != 0; //@line 8144
   $201 = $$540 - (($39 | 0) != 102 ? $$1515 : 0) + (($199 & $198) << 31 >> 31) | 0; //@line 8147
   if (($201 | 0) < ((($$3501$lcssa - $185 >> 2) * 9 | 0) + -9 | 0)) {
    $209 = $201 + 9216 | 0; //@line 8156
    $212 = $$561 + 4 + ((($209 | 0) / 9 | 0) + -1024 << 2) | 0; //@line 8159
    $213 = ($209 | 0) % 9 | 0; //@line 8160
    if (($213 | 0) < 8) {
     $$0527$in633 = $213; //@line 8163
     $$1531632 = 10; //@line 8163
     while (1) {
      $215 = $$1531632 * 10 | 0; //@line 8166
      if (($$0527$in633 | 0) < 7) {
       $$0527$in633 = $$0527$in633 + 1 | 0; //@line 8169
       $$1531632 = $215; //@line 8169
      } else {
       $$1531$lcssa = $215; //@line 8171
       break;
      }
     }
    } else {
     $$1531$lcssa = 10; //@line 8176
    }
    $217 = HEAP32[$212 >> 2] | 0; //@line 8178
    $218 = ($217 >>> 0) % ($$1531$lcssa >>> 0) | 0; //@line 8179
    $221 = ($212 + 4 | 0) == ($$3501$lcssa | 0); //@line 8182
    if ($221 & ($218 | 0) == 0) {
     $$4492 = $212; //@line 8185
     $$4518 = $$1515; //@line 8185
     $$8 = $$3484$lcssa; //@line 8185
    } else {
     $$543 = ((($217 >>> 0) / ($$1531$lcssa >>> 0) | 0) & 1 | 0) == 0 ? 9007199254740992.0 : 9007199254740994.0; //@line 8190
     $225 = ($$1531$lcssa | 0) / 2 | 0; //@line 8191
     $$$564 = $218 >>> 0 < $225 >>> 0 ? .5 : $221 & ($218 | 0) == ($225 | 0) ? 1.0 : 1.5; //@line 8196
     if (!$$0520) {
      $$1467 = $$$564; //@line 8199
      $$1469 = $$543; //@line 8199
     } else {
      $230 = (HEAP8[$$0521 >> 0] | 0) == 45; //@line 8202
      $$1467 = $230 ? -$$$564 : $$$564; //@line 8207
      $$1469 = $230 ? -$$543 : $$543; //@line 8207
     }
     $233 = $217 - $218 | 0; //@line 8209
     HEAP32[$212 >> 2] = $233; //@line 8210
     if ($$1469 + $$1467 != $$1469) {
      $236 = $233 + $$1531$lcssa | 0; //@line 8214
      HEAP32[$212 >> 2] = $236; //@line 8215
      if ($236 >>> 0 > 999999999) {
       $$5486626 = $$3484$lcssa; //@line 8218
       $$sink547625 = $212; //@line 8218
       while (1) {
        $238 = $$sink547625 + -4 | 0; //@line 8220
        HEAP32[$$sink547625 >> 2] = 0; //@line 8221
        if ($238 >>> 0 < $$5486626 >>> 0) {
         $240 = $$5486626 + -4 | 0; //@line 8224
         HEAP32[$240 >> 2] = 0; //@line 8225
         $$6 = $240; //@line 8226
        } else {
         $$6 = $$5486626; //@line 8228
        }
        $242 = (HEAP32[$238 >> 2] | 0) + 1 | 0; //@line 8231
        HEAP32[$238 >> 2] = $242; //@line 8232
        if ($242 >>> 0 > 999999999) {
         $$5486626 = $$6; //@line 8235
         $$sink547625 = $238; //@line 8235
        } else {
         $$5486$lcssa = $$6; //@line 8237
         $$sink547$lcssa = $238; //@line 8237
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa; //@line 8242
       $$sink547$lcssa = $212; //@line 8242
      }
      $247 = ($185 - $$5486$lcssa >> 2) * 9 | 0; //@line 8247
      $248 = HEAP32[$$5486$lcssa >> 2] | 0; //@line 8248
      if ($248 >>> 0 < 10) {
       $$4492 = $$sink547$lcssa; //@line 8251
       $$4518 = $247; //@line 8251
       $$8 = $$5486$lcssa; //@line 8251
      } else {
       $$2516621 = $247; //@line 8253
       $$2532620 = 10; //@line 8253
       while (1) {
        $$2532620 = $$2532620 * 10 | 0; //@line 8255
        $251 = $$2516621 + 1 | 0; //@line 8256
        if ($248 >>> 0 < $$2532620 >>> 0) {
         $$4492 = $$sink547$lcssa; //@line 8259
         $$4518 = $251; //@line 8259
         $$8 = $$5486$lcssa; //@line 8259
         break;
        } else {
         $$2516621 = $251; //@line 8262
        }
       }
      }
     } else {
      $$4492 = $212; //@line 8267
      $$4518 = $$1515; //@line 8267
      $$8 = $$3484$lcssa; //@line 8267
     }
    }
    $253 = $$4492 + 4 | 0; //@line 8270
    $$5519$ph = $$4518; //@line 8273
    $$7505$ph = $$3501$lcssa >>> 0 > $253 >>> 0 ? $253 : $$3501$lcssa; //@line 8273
    $$9$ph = $$8; //@line 8273
   } else {
    $$5519$ph = $$1515; //@line 8275
    $$7505$ph = $$3501$lcssa; //@line 8275
    $$9$ph = $$3484$lcssa; //@line 8275
   }
   $$7505 = $$7505$ph; //@line 8277
   while (1) {
    if ($$7505 >>> 0 <= $$9$ph >>> 0) {
     $$lcssa675 = 0; //@line 8281
     break;
    }
    $256 = $$7505 + -4 | 0; //@line 8284
    if (!(HEAP32[$256 >> 2] | 0)) {
     $$7505 = $256; //@line 8288
    } else {
     $$lcssa675 = 1; //@line 8290
     break;
    }
   }
   $259 = 0 - $$5519$ph | 0; //@line 8294
   do {
    if ($198) {
     $$540$ = $$540 + (($199 ^ 1) & 1) | 0; //@line 8299
     if (($$540$ | 0) > ($$5519$ph | 0) & ($$5519$ph | 0) > -5) {
      $$0479 = $5 + -1 | 0; //@line 8307
      $$2476 = $$540$ + -1 - $$5519$ph | 0; //@line 8307
     } else {
      $$0479 = $5 + -2 | 0; //@line 8311
      $$2476 = $$540$ + -1 | 0; //@line 8311
     }
     $267 = $4 & 8; //@line 8313
     if (!$267) {
      if ($$lcssa675) {
       $270 = HEAP32[$$7505 + -4 >> 2] | 0; //@line 8318
       if (!$270) {
        $$2529 = 9; //@line 8321
       } else {
        if (!(($270 >>> 0) % 10 | 0)) {
         $$1528617 = 0; //@line 8326
         $$3533616 = 10; //@line 8326
         while (1) {
          $$3533616 = $$3533616 * 10 | 0; //@line 8328
          $275 = $$1528617 + 1 | 0; //@line 8329
          if (($270 >>> 0) % ($$3533616 >>> 0) | 0 | 0) {
           $$2529 = $275; //@line 8335
           break;
          } else {
           $$1528617 = $275; //@line 8333
          }
         }
        } else {
         $$2529 = 0; //@line 8340
        }
       }
      } else {
       $$2529 = 9; //@line 8344
      }
      $284 = (($$7505 - $185 >> 2) * 9 | 0) + -9 | 0; //@line 8352
      if (($$0479 | 32 | 0) == 102) {
       $285 = $284 - $$2529 | 0; //@line 8354
       $$548 = ($285 | 0) > 0 ? $285 : 0; //@line 8356
       $$1480 = $$0479; //@line 8359
       $$3477 = ($$2476 | 0) < ($$548 | 0) ? $$2476 : $$548; //@line 8359
       $$pre$phi698Z2D = 0; //@line 8359
       break;
      } else {
       $289 = $284 + $$5519$ph - $$2529 | 0; //@line 8363
       $$550 = ($289 | 0) > 0 ? $289 : 0; //@line 8365
       $$1480 = $$0479; //@line 8368
       $$3477 = ($$2476 | 0) < ($$550 | 0) ? $$2476 : $$550; //@line 8368
       $$pre$phi698Z2D = 0; //@line 8368
       break;
      }
     } else {
      $$1480 = $$0479; //@line 8372
      $$3477 = $$2476; //@line 8372
      $$pre$phi698Z2D = $267; //@line 8372
     }
    } else {
     $$1480 = $5; //@line 8376
     $$3477 = $$540; //@line 8376
     $$pre$phi698Z2D = $4 & 8; //@line 8376
    }
   } while (0);
   $292 = $$3477 | $$pre$phi698Z2D; //@line 8379
   $294 = ($292 | 0) != 0 & 1; //@line 8381
   $296 = ($$1480 | 32 | 0) == 102; //@line 8383
   if ($296) {
    $$2513 = 0; //@line 8387
    $$pn = ($$5519$ph | 0) > 0 ? $$5519$ph : 0; //@line 8387
   } else {
    $300 = ($$5519$ph | 0) < 0 ? $259 : $$5519$ph; //@line 8390
    $303 = _fmt_u($300, (($300 | 0) < 0) << 31 >> 31, $11) | 0; //@line 8393
    $304 = $11; //@line 8394
    if (($304 - $303 | 0) < 2) {
     $$1512610 = $303; //@line 8399
     while (1) {
      $308 = $$1512610 + -1 | 0; //@line 8401
      HEAP8[$308 >> 0] = 48; //@line 8402
      if (($304 - $308 | 0) < 2) {
       $$1512610 = $308; //@line 8407
      } else {
       $$1512$lcssa = $308; //@line 8409
       break;
      }
     }
    } else {
     $$1512$lcssa = $303; //@line 8414
    }
    HEAP8[$$1512$lcssa + -1 >> 0] = ($$5519$ph >> 31 & 2) + 43; //@line 8421
    $318 = $$1512$lcssa + -2 | 0; //@line 8423
    HEAP8[$318 >> 0] = $$1480; //@line 8424
    $$2513 = $318; //@line 8427
    $$pn = $304 - $318 | 0; //@line 8427
   }
   $323 = $$0520 + 1 + $$3477 + $294 + $$pn | 0; //@line 8432
   _pad_676($0, 32, $2, $323, $4); //@line 8433
   _out_670($0, $$0521, $$0520); //@line 8434
   _pad_676($0, 48, $2, $323, $4 ^ 65536); //@line 8436
   if ($296) {
    $$0496$$9 = $$9$ph >>> 0 > $$561 >>> 0 ? $$561 : $$9$ph; //@line 8439
    $326 = $8 + 9 | 0; //@line 8440
    $327 = $326; //@line 8441
    $328 = $8 + 8 | 0; //@line 8442
    $$5493600 = $$0496$$9; //@line 8443
    do {
     $330 = _fmt_u(HEAP32[$$5493600 >> 2] | 0, 0, $326) | 0; //@line 8446
     if (($$5493600 | 0) == ($$0496$$9 | 0)) {
      if (($330 | 0) == ($326 | 0)) {
       HEAP8[$328 >> 0] = 48; //@line 8451
       $$1465 = $328; //@line 8452
      } else {
       $$1465 = $330; //@line 8454
      }
     } else {
      if ($330 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $330 - $9 | 0) | 0; //@line 8461
       $$0464597 = $330; //@line 8462
       while (1) {
        $335 = $$0464597 + -1 | 0; //@line 8464
        if ($335 >>> 0 > $8 >>> 0) {
         $$0464597 = $335; //@line 8467
        } else {
         $$1465 = $335; //@line 8469
         break;
        }
       }
      } else {
       $$1465 = $330; //@line 8474
      }
     }
     _out_670($0, $$1465, $327 - $$1465 | 0); //@line 8479
     $$5493600 = $$5493600 + 4 | 0; //@line 8480
    } while ($$5493600 >>> 0 <= $$561 >>> 0);
    if ($292 | 0) {
     _out_670($0, 1924, 1); //@line 8490
    }
    if ($$5493600 >>> 0 < $$7505 >>> 0 & ($$3477 | 0) > 0) {
     $$4478593 = $$3477; //@line 8496
     $$6494592 = $$5493600; //@line 8496
     while (1) {
      $347 = _fmt_u(HEAP32[$$6494592 >> 2] | 0, 0, $326) | 0; //@line 8499
      if ($347 >>> 0 > $8 >>> 0) {
       _memset($8 | 0, 48, $347 - $9 | 0) | 0; //@line 8504
       $$0463587 = $347; //@line 8505
       while (1) {
        $351 = $$0463587 + -1 | 0; //@line 8507
        if ($351 >>> 0 > $8 >>> 0) {
         $$0463587 = $351; //@line 8510
        } else {
         $$0463$lcssa = $351; //@line 8512
         break;
        }
       }
      } else {
       $$0463$lcssa = $347; //@line 8517
      }
      _out_670($0, $$0463$lcssa, ($$4478593 | 0) < 9 ? $$4478593 : 9); //@line 8521
      $$6494592 = $$6494592 + 4 | 0; //@line 8522
      $356 = $$4478593 + -9 | 0; //@line 8523
      if (!($$6494592 >>> 0 < $$7505 >>> 0 & ($$4478593 | 0) > 9)) {
       $$4478$lcssa = $356; //@line 8530
       break;
      } else {
       $$4478593 = $356; //@line 8528
      }
     }
    } else {
     $$4478$lcssa = $$3477; //@line 8535
    }
    _pad_676($0, 48, $$4478$lcssa + 9 | 0, 9, 0); //@line 8538
   } else {
    $$7505$ = $$lcssa675 ? $$7505 : $$9$ph + 4 | 0; //@line 8541
    if (($$3477 | 0) > -1) {
     $363 = $8 + 9 | 0; //@line 8544
     $364 = ($$pre$phi698Z2D | 0) == 0; //@line 8545
     $365 = $363; //@line 8546
     $366 = 0 - $9 | 0; //@line 8547
     $367 = $8 + 8 | 0; //@line 8548
     $$5605 = $$3477; //@line 8549
     $$7495604 = $$9$ph; //@line 8549
     while (1) {
      $369 = _fmt_u(HEAP32[$$7495604 >> 2] | 0, 0, $363) | 0; //@line 8552
      if (($369 | 0) == ($363 | 0)) {
       HEAP8[$367 >> 0] = 48; //@line 8555
       $$0 = $367; //@line 8556
      } else {
       $$0 = $369; //@line 8558
      }
      do {
       if (($$7495604 | 0) == ($$9$ph | 0)) {
        $375 = $$0 + 1 | 0; //@line 8563
        _out_670($0, $$0, 1); //@line 8564
        if ($364 & ($$5605 | 0) < 1) {
         $$2 = $375; //@line 8568
         break;
        }
        _out_670($0, 1924, 1); //@line 8571
        $$2 = $375; //@line 8572
       } else {
        if ($$0 >>> 0 <= $8 >>> 0) {
         $$2 = $$0; //@line 8576
         break;
        }
        _memset($8 | 0, 48, $$0 + $366 | 0) | 0; //@line 8581
        $$1601 = $$0; //@line 8582
        while (1) {
         $373 = $$1601 + -1 | 0; //@line 8584
         if ($373 >>> 0 > $8 >>> 0) {
          $$1601 = $373; //@line 8587
         } else {
          $$2 = $373; //@line 8589
          break;
         }
        }
       }
      } while (0);
      $378 = $365 - $$2 | 0; //@line 8596
      _out_670($0, $$2, ($$5605 | 0) > ($378 | 0) ? $378 : $$5605); //@line 8599
      $381 = $$5605 - $378 | 0; //@line 8600
      $$7495604 = $$7495604 + 4 | 0; //@line 8601
      if (!($$7495604 >>> 0 < $$7505$ >>> 0 & ($381 | 0) > -1)) {
       $$5$lcssa = $381; //@line 8608
       break;
      } else {
       $$5605 = $381; //@line 8606
      }
     }
    } else {
     $$5$lcssa = $$3477; //@line 8613
    }
    _pad_676($0, 48, $$5$lcssa + 18 | 0, 18, 0); //@line 8616
    _out_670($0, $$2513, $11 - $$2513 | 0); //@line 8620
   }
   _pad_676($0, 32, $2, $323, $4 ^ 8192); //@line 8623
   $$sink560 = $323; //@line 8624
  }
 } while (0);
 STACKTOP = sp; //@line 8629
 return (($$sink560 | 0) < ($2 | 0) ? $2 : $$sink560) | 0; //@line 8629
}
function _printf_core($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$$5 = 0, $$0 = 0, $$0228 = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2261 = 0, $$2271 = 0, $$3265 = 0, $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre342 = 0, $$pre345 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $105 = 0, $106 = 0, $109 = 0, $11 = 0, $112 = 0, $115 = 0, $12 = 0, $125 = 0, $129 = 0, $13 = 0, $14 = 0, $140 = 0, $144 = 0, $151 = 0, $152 = 0, $154 = 0, $156 = 0, $158 = 0, $167 = 0, $168 = 0, $173 = 0, $176 = 0, $181 = 0, $182 = 0, $187 = 0, $189 = 0, $196 = 0, $197 = 0, $20 = 0, $208 = 0, $21 = 0, $220 = 0, $227 = 0, $229 = 0, $23 = 0, $232 = 0, $234 = 0, $24 = 0, $242 = 0, $244 = 0, $247 = 0, $248 = 0, $25 = 0, $252 = 0, $256 = 0, $258 = 0, $261 = 0, $263 = 0, $264 = 0, $265 = 0, $27 = 0, $275 = 0, $276 = 0, $281 = 0, $283 = 0, $284 = 0, $290 = 0, $30 = 0, $302 = 0, $305 = 0, $306 = 0, $318 = 0, $320 = 0, $325 = 0, $329 = 0, $331 = 0, $343 = 0, $345 = 0, $352 = 0, $356 = 0, $36 = 0, $363 = 0, $364 = 0, $365 = 0, $43 = 0, $5 = 0, $51 = 0, $52 = 0, $54 = 0, $6 = 0, $60 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $68 = 0, $7 = 0, $79 = 0, $8 = 0, $83 = 0, $9 = 0, $or$cond = 0, $or$cond278 = 0, $storemerge274 = 0, label = 0, sp = 0, $158$looptemp = 0;
 sp = STACKTOP; //@line 6307
 STACKTOP = STACKTOP + 64 | 0; //@line 6308
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 6308
 $5 = sp + 16 | 0; //@line 6309
 $6 = sp; //@line 6310
 $7 = sp + 24 | 0; //@line 6311
 $8 = sp + 8 | 0; //@line 6312
 $9 = sp + 20 | 0; //@line 6313
 HEAP32[$5 >> 2] = $1; //@line 6314
 $10 = ($0 | 0) != 0; //@line 6315
 $11 = $7 + 40 | 0; //@line 6316
 $12 = $11; //@line 6317
 $13 = $7 + 39 | 0; //@line 6318
 $14 = $8 + 4 | 0; //@line 6319
 $$0243 = 0; //@line 6320
 $$0247 = 0; //@line 6320
 $$0269 = 0; //@line 6320
 L1 : while (1) {
  do {
   if (($$0247 | 0) > -1) {
    if (($$0243 | 0) > (2147483647 - $$0247 | 0)) {
     HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 6329
     $$1248 = -1; //@line 6330
     break;
    } else {
     $$1248 = $$0243 + $$0247 | 0; //@line 6334
     break;
    }
   } else {
    $$1248 = $$0247; //@line 6338
   }
  } while (0);
  $20 = HEAP32[$5 >> 2] | 0; //@line 6341
  $21 = HEAP8[$20 >> 0] | 0; //@line 6342
  if (!($21 << 24 >> 24)) {
   label = 88; //@line 6345
   break;
  } else {
   $23 = $21; //@line 6348
   $25 = $20; //@line 6348
  }
  L9 : while (1) {
   switch ($23 << 24 >> 24) {
   case 37:
    {
     $$0249303 = $25; //@line 6353
     $27 = $25; //@line 6353
     label = 9; //@line 6354
     break L9;
     break;
    }
   case 0:
    {
     $$0249$lcssa = $25; //@line 6359
     break L9;
     break;
    }
   default:
    {}
   }
   $24 = $25 + 1 | 0; //@line 6366
   HEAP32[$5 >> 2] = $24; //@line 6367
   $23 = HEAP8[$24 >> 0] | 0; //@line 6369
   $25 = $24; //@line 6369
  }
  L12 : do {
   if ((label | 0) == 9) {
    while (1) {
     label = 0; //@line 6374
     if ((HEAP8[$27 + 1 >> 0] | 0) != 37) {
      $$0249$lcssa = $$0249303; //@line 6379
      break L12;
     }
     $30 = $$0249303 + 1 | 0; //@line 6382
     $27 = $27 + 2 | 0; //@line 6383
     HEAP32[$5 >> 2] = $27; //@line 6384
     if ((HEAP8[$27 >> 0] | 0) != 37) {
      $$0249$lcssa = $30; //@line 6391
      break;
     } else {
      $$0249303 = $30; //@line 6388
      label = 9; //@line 6389
     }
    }
   }
  } while (0);
  $36 = $$0249$lcssa - $20 | 0; //@line 6399
  if ($10) {
   _out_670($0, $20, $36); //@line 6401
  }
  if ($36 | 0) {
   $$0243 = $36; //@line 6405
   $$0247 = $$1248; //@line 6405
   continue;
  }
  $43 = (_isdigit(HEAP8[(HEAP32[$5 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0; //@line 6413
  $$pre342 = HEAP32[$5 >> 2] | 0; //@line 6414
  if ($43) {
   $$0253 = -1; //@line 6416
   $$1270 = $$0269; //@line 6416
   $$sink = 1; //@line 6416
  } else {
   if ((HEAP8[$$pre342 + 2 >> 0] | 0) == 36) {
    $$0253 = (HEAP8[$$pre342 + 1 >> 0] | 0) + -48 | 0; //@line 6426
    $$1270 = 1; //@line 6426
    $$sink = 3; //@line 6426
   } else {
    $$0253 = -1; //@line 6428
    $$1270 = $$0269; //@line 6428
    $$sink = 1; //@line 6428
   }
  }
  $51 = $$pre342 + $$sink | 0; //@line 6431
  HEAP32[$5 >> 2] = $51; //@line 6432
  $52 = HEAP8[$51 >> 0] | 0; //@line 6433
  $54 = ($52 << 24 >> 24) + -32 | 0; //@line 6435
  if ($54 >>> 0 > 31 | (1 << $54 & 75913 | 0) == 0) {
   $$0262$lcssa = 0; //@line 6442
   $$lcssa291 = $52; //@line 6442
   $$lcssa292 = $51; //@line 6442
  } else {
   $$0262309 = 0; //@line 6444
   $60 = $52; //@line 6444
   $65 = $51; //@line 6444
   while (1) {
    $63 = 1 << ($60 << 24 >> 24) + -32 | $$0262309; //@line 6449
    $64 = $65 + 1 | 0; //@line 6450
    HEAP32[$5 >> 2] = $64; //@line 6451
    $66 = HEAP8[$64 >> 0] | 0; //@line 6452
    $68 = ($66 << 24 >> 24) + -32 | 0; //@line 6454
    if ($68 >>> 0 > 31 | (1 << $68 & 75913 | 0) == 0) {
     $$0262$lcssa = $63; //@line 6461
     $$lcssa291 = $66; //@line 6461
     $$lcssa292 = $64; //@line 6461
     break;
    } else {
     $$0262309 = $63; //@line 6464
     $60 = $66; //@line 6464
     $65 = $64; //@line 6464
    }
   }
  }
  if ($$lcssa291 << 24 >> 24 == 42) {
   if (!(_isdigit(HEAP8[$$lcssa292 + 1 >> 0] | 0) | 0)) {
    label = 23; //@line 6476
   } else {
    $79 = HEAP32[$5 >> 2] | 0; //@line 6478
    if ((HEAP8[$79 + 2 >> 0] | 0) == 36) {
     $83 = $79 + 1 | 0; //@line 6483
     HEAP32[$4 + ((HEAP8[$83 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6488
     $$0259 = HEAP32[$3 + ((HEAP8[$83 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6500
     $$2271 = 1; //@line 6500
     $storemerge274 = $79 + 3 | 0; //@line 6500
    } else {
     label = 23; //@line 6502
    }
   }
   if ((label | 0) == 23) {
    label = 0; //@line 6506
    if ($$1270 | 0) {
     $$0 = -1; //@line 6509
     break;
    }
    if ($10) {
     $105 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6524
     $106 = HEAP32[$105 >> 2] | 0; //@line 6525
     HEAP32[$2 >> 2] = $105 + 4; //@line 6527
     $363 = $106; //@line 6528
    } else {
     $363 = 0; //@line 6530
    }
    $$0259 = $363; //@line 6534
    $$2271 = 0; //@line 6534
    $storemerge274 = (HEAP32[$5 >> 2] | 0) + 1 | 0; //@line 6534
   }
   HEAP32[$5 >> 2] = $storemerge274; //@line 6536
   $109 = ($$0259 | 0) < 0; //@line 6537
   $$1260 = $109 ? 0 - $$0259 | 0 : $$0259; //@line 6542
   $$1263 = $109 ? $$0262$lcssa | 8192 : $$0262$lcssa; //@line 6542
   $$3272 = $$2271; //@line 6542
   $115 = $storemerge274; //@line 6542
  } else {
   $112 = _getint_671($5) | 0; //@line 6544
   if (($112 | 0) < 0) {
    $$0 = -1; //@line 6547
    break;
   }
   $$1260 = $112; //@line 6551
   $$1263 = $$0262$lcssa; //@line 6551
   $$3272 = $$1270; //@line 6551
   $115 = HEAP32[$5 >> 2] | 0; //@line 6551
  }
  do {
   if ((HEAP8[$115 >> 0] | 0) == 46) {
    if ((HEAP8[$115 + 1 >> 0] | 0) != 42) {
     HEAP32[$5 >> 2] = $115 + 1; //@line 6562
     $156 = _getint_671($5) | 0; //@line 6563
     $$0254 = $156; //@line 6565
     $$pre345 = HEAP32[$5 >> 2] | 0; //@line 6565
     break;
    }
    if (_isdigit(HEAP8[$115 + 2 >> 0] | 0) | 0) {
     $125 = HEAP32[$5 >> 2] | 0; //@line 6574
     if ((HEAP8[$125 + 3 >> 0] | 0) == 36) {
      $129 = $125 + 2 | 0; //@line 6579
      HEAP32[$4 + ((HEAP8[$129 >> 0] | 0) + -48 << 2) >> 2] = 10; //@line 6584
      $140 = HEAP32[$3 + ((HEAP8[$129 >> 0] | 0) + -48 << 3) >> 2] | 0; //@line 6591
      $144 = $125 + 4 | 0; //@line 6595
      HEAP32[$5 >> 2] = $144; //@line 6596
      $$0254 = $140; //@line 6597
      $$pre345 = $144; //@line 6597
      break;
     }
    }
    if ($$3272 | 0) {
     $$0 = -1; //@line 6603
     break L1;
    }
    if ($10) {
     $151 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 6618
     $152 = HEAP32[$151 >> 2] | 0; //@line 6619
     HEAP32[$2 >> 2] = $151 + 4; //@line 6621
     $364 = $152; //@line 6622
    } else {
     $364 = 0; //@line 6624
    }
    $154 = (HEAP32[$5 >> 2] | 0) + 2 | 0; //@line 6627
    HEAP32[$5 >> 2] = $154; //@line 6628
    $$0254 = $364; //@line 6629
    $$pre345 = $154; //@line 6629
   } else {
    $$0254 = -1; //@line 6631
    $$pre345 = $115; //@line 6631
   }
  } while (0);
  $$0252 = 0; //@line 6634
  $158 = $$pre345; //@line 6634
  while (1) {
   if (((HEAP8[$158 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
    $$0 = -1; //@line 6641
    break L1;
   }
   $158$looptemp = $158;
   $158 = $158 + 1 | 0; //@line 6644
   HEAP32[$5 >> 2] = $158; //@line 6645
   $167 = HEAP8[(HEAP8[$158$looptemp >> 0] | 0) + -65 + (1392 + ($$0252 * 58 | 0)) >> 0] | 0; //@line 6650
   $168 = $167 & 255; //@line 6651
   if (($168 + -1 | 0) >>> 0 >= 8) {
    break;
   } else {
    $$0252 = $168; //@line 6655
   }
  }
  if (!($167 << 24 >> 24)) {
   $$0 = -1; //@line 6662
   break;
  }
  $173 = ($$0253 | 0) > -1; //@line 6666
  do {
   if ($167 << 24 >> 24 == 19) {
    if ($173) {
     $$0 = -1; //@line 6670
     break L1;
    } else {
     label = 50; //@line 6673
    }
   } else {
    if ($173) {
     HEAP32[$4 + ($$0253 << 2) >> 2] = $168; //@line 6678
     $176 = $3 + ($$0253 << 3) | 0; //@line 6680
     $181 = HEAP32[$176 + 4 >> 2] | 0; //@line 6685
     $182 = $6; //@line 6686
     HEAP32[$182 >> 2] = HEAP32[$176 >> 2]; //@line 6688
     HEAP32[$182 + 4 >> 2] = $181; //@line 6691
     label = 50; //@line 6692
     break;
    }
    if (!$10) {
     $$0 = 0; //@line 6696
     break L1;
    }
    _pop_arg_673($6, $168, $2); //@line 6699
    $187 = HEAP32[$5 >> 2] | 0; //@line 6701
   }
  } while (0);
  if ((label | 0) == 50) {
   label = 0; //@line 6705
   if ($10) {
    $187 = $158; //@line 6707
   } else {
    $$0243 = 0; //@line 6709
    $$0247 = $$1248; //@line 6709
    $$0269 = $$3272; //@line 6709
    continue;
   }
  }
  $189 = HEAP8[$187 + -1 >> 0] | 0; //@line 6715
  $$0235 = ($$0252 | 0) != 0 & ($189 & 15 | 0) == 3 ? $189 & -33 : $189; //@line 6721
  $196 = $$1263 & -65537; //@line 6724
  $$1263$ = ($$1263 & 8192 | 0) == 0 ? $$1263 : $196; //@line 6725
  L73 : do {
   switch ($$0235 | 0) {
   case 110:
    {
     switch (($$0252 & 255) << 24 >> 24) {
     case 0:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6733
       $$0243 = 0; //@line 6734
       $$0247 = $$1248; //@line 6734
       $$0269 = $$3272; //@line 6734
       continue L1;
       break;
      }
     case 1:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6740
       $$0243 = 0; //@line 6741
       $$0247 = $$1248; //@line 6741
       $$0269 = $$3272; //@line 6741
       continue L1;
       break;
      }
     case 2:
      {
       $208 = HEAP32[$6 >> 2] | 0; //@line 6749
       HEAP32[$208 >> 2] = $$1248; //@line 6751
       HEAP32[$208 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6754
       $$0243 = 0; //@line 6755
       $$0247 = $$1248; //@line 6755
       $$0269 = $$3272; //@line 6755
       continue L1;
       break;
      }
     case 3:
      {
       HEAP16[HEAP32[$6 >> 2] >> 1] = $$1248; //@line 6762
       $$0243 = 0; //@line 6763
       $$0247 = $$1248; //@line 6763
       $$0269 = $$3272; //@line 6763
       continue L1;
       break;
      }
     case 4:
      {
       HEAP8[HEAP32[$6 >> 2] >> 0] = $$1248; //@line 6770
       $$0243 = 0; //@line 6771
       $$0247 = $$1248; //@line 6771
       $$0269 = $$3272; //@line 6771
       continue L1;
       break;
      }
     case 6:
      {
       HEAP32[HEAP32[$6 >> 2] >> 2] = $$1248; //@line 6777
       $$0243 = 0; //@line 6778
       $$0247 = $$1248; //@line 6778
       $$0269 = $$3272; //@line 6778
       continue L1;
       break;
      }
     case 7:
      {
       $220 = HEAP32[$6 >> 2] | 0; //@line 6786
       HEAP32[$220 >> 2] = $$1248; //@line 6788
       HEAP32[$220 + 4 >> 2] = (($$1248 | 0) < 0) << 31 >> 31; //@line 6791
       $$0243 = 0; //@line 6792
       $$0247 = $$1248; //@line 6792
       $$0269 = $$3272; //@line 6792
       continue L1;
       break;
      }
     default:
      {
       $$0243 = 0; //@line 6797
       $$0247 = $$1248; //@line 6797
       $$0269 = $$3272; //@line 6797
       continue L1;
      }
     }
     break;
    }
   case 112:
    {
     $$1236 = 120; //@line 6807
     $$1255 = $$0254 >>> 0 > 8 ? $$0254 : 8; //@line 6807
     $$3265 = $$1263$ | 8; //@line 6807
     label = 62; //@line 6808
     break;
    }
   case 88:
   case 120:
    {
     $$1236 = $$0235; //@line 6812
     $$1255 = $$0254; //@line 6812
     $$3265 = $$1263$; //@line 6812
     label = 62; //@line 6813
     break;
    }
   case 111:
    {
     $242 = $6; //@line 6817
     $244 = HEAP32[$242 >> 2] | 0; //@line 6819
     $247 = HEAP32[$242 + 4 >> 2] | 0; //@line 6822
     $248 = _fmt_o($244, $247, $11) | 0; //@line 6823
     $252 = $12 - $248 | 0; //@line 6827
     $$0228 = $248; //@line 6832
     $$1233 = 0; //@line 6832
     $$1238 = 1856; //@line 6832
     $$2256 = ($$1263$ & 8 | 0) == 0 | ($$0254 | 0) > ($252 | 0) ? $$0254 : $252 + 1 | 0; //@line 6832
     $$4266 = $$1263$; //@line 6832
     $281 = $244; //@line 6832
     $283 = $247; //@line 6832
     label = 68; //@line 6833
     break;
    }
   case 105:
   case 100:
    {
     $256 = $6; //@line 6837
     $258 = HEAP32[$256 >> 2] | 0; //@line 6839
     $261 = HEAP32[$256 + 4 >> 2] | 0; //@line 6842
     if (($261 | 0) < 0) {
      $263 = _i64Subtract(0, 0, $258 | 0, $261 | 0) | 0; //@line 6845
      $264 = tempRet0; //@line 6846
      $265 = $6; //@line 6847
      HEAP32[$265 >> 2] = $263; //@line 6849
      HEAP32[$265 + 4 >> 2] = $264; //@line 6852
      $$0232 = 1; //@line 6853
      $$0237 = 1856; //@line 6853
      $275 = $263; //@line 6853
      $276 = $264; //@line 6853
      label = 67; //@line 6854
      break L73;
     } else {
      $$0232 = ($$1263$ & 2049 | 0) != 0 & 1; //@line 6866
      $$0237 = ($$1263$ & 2048 | 0) == 0 ? ($$1263$ & 1 | 0) == 0 ? 1856 : 1858 : 1857; //@line 6866
      $275 = $258; //@line 6866
      $276 = $261; //@line 6866
      label = 67; //@line 6867
      break L73;
     }
     break;
    }
   case 117:
    {
     $197 = $6; //@line 6873
     $$0232 = 0; //@line 6879
     $$0237 = 1856; //@line 6879
     $275 = HEAP32[$197 >> 2] | 0; //@line 6879
     $276 = HEAP32[$197 + 4 >> 2] | 0; //@line 6879
     label = 67; //@line 6880
     break;
    }
   case 99:
    {
     HEAP8[$13 >> 0] = HEAP32[$6 >> 2]; //@line 6891
     $$2 = $13; //@line 6892
     $$2234 = 0; //@line 6892
     $$2239 = 1856; //@line 6892
     $$2251 = $11; //@line 6892
     $$5 = 1; //@line 6892
     $$6268 = $196; //@line 6892
     break;
    }
   case 109:
    {
     $$1 = _strerror(HEAP32[(___errno_location() | 0) >> 2] | 0) | 0; //@line 6899
     label = 72; //@line 6900
     break;
    }
   case 115:
    {
     $302 = HEAP32[$6 >> 2] | 0; //@line 6904
     $$1 = $302 | 0 ? $302 : 1866; //@line 6907
     label = 72; //@line 6908
     break;
    }
   case 67:
    {
     HEAP32[$8 >> 2] = HEAP32[$6 >> 2]; //@line 6918
     HEAP32[$14 >> 2] = 0; //@line 6919
     HEAP32[$6 >> 2] = $8; //@line 6920
     $$4258354 = -1; //@line 6921
     $365 = $8; //@line 6921
     label = 76; //@line 6922
     break;
    }
   case 83:
    {
     $$pre348 = HEAP32[$6 >> 2] | 0; //@line 6926
     if (!$$0254) {
      _pad_676($0, 32, $$1260, 0, $$1263$); //@line 6929
      $$0240$lcssa356 = 0; //@line 6930
      label = 85; //@line 6931
     } else {
      $$4258354 = $$0254; //@line 6933
      $365 = $$pre348; //@line 6933
      label = 76; //@line 6934
     }
     break;
    }
   case 65:
   case 71:
   case 70:
   case 69:
   case 97:
   case 103:
   case 102:
   case 101:
    {
     $$0243 = _fmt_fp($0, +HEAPF64[$6 >> 3], $$1260, $$0254, $$1263$, $$0235) | 0; //@line 6941
     $$0247 = $$1248; //@line 6941
     $$0269 = $$3272; //@line 6941
     continue L1;
     break;
    }
   default:
    {
     $$2 = $20; //@line 6946
     $$2234 = 0; //@line 6946
     $$2239 = 1856; //@line 6946
     $$2251 = $11; //@line 6946
     $$5 = $$0254; //@line 6946
     $$6268 = $$1263$; //@line 6946
    }
   }
  } while (0);
  L97 : do {
   if ((label | 0) == 62) {
    label = 0; //@line 6952
    $227 = $6; //@line 6953
    $229 = HEAP32[$227 >> 2] | 0; //@line 6955
    $232 = HEAP32[$227 + 4 >> 2] | 0; //@line 6958
    $234 = _fmt_x($229, $232, $11, $$1236 & 32) | 0; //@line 6960
    $or$cond278 = ($$3265 & 8 | 0) == 0 | ($229 | 0) == 0 & ($232 | 0) == 0; //@line 6966
    $$0228 = $234; //@line 6971
    $$1233 = $or$cond278 ? 0 : 2; //@line 6971
    $$1238 = $or$cond278 ? 1856 : 1856 + ($$1236 >> 4) | 0; //@line 6971
    $$2256 = $$1255; //@line 6971
    $$4266 = $$3265; //@line 6971
    $281 = $229; //@line 6971
    $283 = $232; //@line 6971
    label = 68; //@line 6972
   } else if ((label | 0) == 67) {
    label = 0; //@line 6975
    $$0228 = _fmt_u($275, $276, $11) | 0; //@line 6977
    $$1233 = $$0232; //@line 6977
    $$1238 = $$0237; //@line 6977
    $$2256 = $$0254; //@line 6977
    $$4266 = $$1263$; //@line 6977
    $281 = $275; //@line 6977
    $283 = $276; //@line 6977
    label = 68; //@line 6978
   } else if ((label | 0) == 72) {
    label = 0; //@line 6981
    $305 = _memchr($$1, 0, $$0254) | 0; //@line 6982
    $306 = ($305 | 0) == 0; //@line 6983
    $$2 = $$1; //@line 6990
    $$2234 = 0; //@line 6990
    $$2239 = 1856; //@line 6990
    $$2251 = $306 ? $$1 + $$0254 | 0 : $305; //@line 6990
    $$5 = $306 ? $$0254 : $305 - $$1 | 0; //@line 6990
    $$6268 = $196; //@line 6990
   } else if ((label | 0) == 76) {
    label = 0; //@line 6993
    $$0229316 = $365; //@line 6994
    $$0240315 = 0; //@line 6994
    $$1244314 = 0; //@line 6994
    while (1) {
     $318 = HEAP32[$$0229316 >> 2] | 0; //@line 6996
     if (!$318) {
      $$0240$lcssa = $$0240315; //@line 6999
      $$2245 = $$1244314; //@line 6999
      break;
     }
     $320 = _wctomb($9, $318) | 0; //@line 7002
     if (($320 | 0) < 0 | $320 >>> 0 > ($$4258354 - $$0240315 | 0) >>> 0) {
      $$0240$lcssa = $$0240315; //@line 7008
      $$2245 = $320; //@line 7008
      break;
     }
     $325 = $320 + $$0240315 | 0; //@line 7012
     if ($$4258354 >>> 0 > $325 >>> 0) {
      $$0229316 = $$0229316 + 4 | 0; //@line 7015
      $$0240315 = $325; //@line 7015
      $$1244314 = $320; //@line 7015
     } else {
      $$0240$lcssa = $325; //@line 7017
      $$2245 = $320; //@line 7017
      break;
     }
    }
    if (($$2245 | 0) < 0) {
     $$0 = -1; //@line 7023
     break L1;
    }
    _pad_676($0, 32, $$1260, $$0240$lcssa, $$1263$); //@line 7026
    if (!$$0240$lcssa) {
     $$0240$lcssa356 = 0; //@line 7029
     label = 85; //@line 7030
    } else {
     $$1230327 = $365; //@line 7032
     $$1241326 = 0; //@line 7032
     while (1) {
      $329 = HEAP32[$$1230327 >> 2] | 0; //@line 7034
      if (!$329) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7037
       label = 85; //@line 7038
       break L97;
      }
      $331 = _wctomb($9, $329) | 0; //@line 7041
      $$1241326 = $331 + $$1241326 | 0; //@line 7042
      if (($$1241326 | 0) > ($$0240$lcssa | 0)) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7045
       label = 85; //@line 7046
       break L97;
      }
      _out_670($0, $9, $331); //@line 7050
      if ($$1241326 >>> 0 >= $$0240$lcssa >>> 0) {
       $$0240$lcssa356 = $$0240$lcssa; //@line 7055
       label = 85; //@line 7056
       break;
      } else {
       $$1230327 = $$1230327 + 4 | 0; //@line 7053
      }
     }
    }
   }
  } while (0);
  if ((label | 0) == 68) {
   label = 0; //@line 7064
   $284 = ($281 | 0) != 0 | ($283 | 0) != 0; //@line 7070
   $or$cond = ($$2256 | 0) != 0 | $284; //@line 7072
   $290 = $12 - $$0228 + (($284 ^ 1) & 1) | 0; //@line 7077
   $$2 = $or$cond ? $$0228 : $11; //@line 7082
   $$2234 = $$1233; //@line 7082
   $$2239 = $$1238; //@line 7082
   $$2251 = $11; //@line 7082
   $$5 = $or$cond ? ($$2256 | 0) > ($290 | 0) ? $$2256 : $290 : $$2256; //@line 7082
   $$6268 = ($$2256 | 0) > -1 ? $$4266 & -65537 : $$4266; //@line 7082
  } else if ((label | 0) == 85) {
   label = 0; //@line 7085
   _pad_676($0, 32, $$1260, $$0240$lcssa356, $$1263$ ^ 8192); //@line 7087
   $$0243 = ($$1260 | 0) > ($$0240$lcssa356 | 0) ? $$1260 : $$0240$lcssa356; //@line 7090
   $$0247 = $$1248; //@line 7090
   $$0269 = $$3272; //@line 7090
   continue;
  }
  $343 = $$2251 - $$2 | 0; //@line 7095
  $$$5 = ($$5 | 0) < ($343 | 0) ? $343 : $$5; //@line 7097
  $345 = $$$5 + $$2234 | 0; //@line 7098
  $$2261 = ($$1260 | 0) < ($345 | 0) ? $345 : $$1260; //@line 7100
  _pad_676($0, 32, $$2261, $345, $$6268); //@line 7101
  _out_670($0, $$2239, $$2234); //@line 7102
  _pad_676($0, 48, $$2261, $345, $$6268 ^ 65536); //@line 7104
  _pad_676($0, 48, $$$5, $343, 0); //@line 7105
  _out_670($0, $$2, $343); //@line 7106
  _pad_676($0, 32, $$2261, $345, $$6268 ^ 8192); //@line 7108
  $$0243 = $$2261; //@line 7109
  $$0247 = $$1248; //@line 7109
  $$0269 = $$3272; //@line 7109
 }
 L116 : do {
  if ((label | 0) == 88) {
   if (!$0) {
    if (!$$0269) {
     $$0 = 0; //@line 7117
    } else {
     $$2242302 = 1; //@line 7119
     while (1) {
      $352 = HEAP32[$4 + ($$2242302 << 2) >> 2] | 0; //@line 7122
      if (!$352) {
       $$2242$lcssa = $$2242302; //@line 7125
       break;
      }
      _pop_arg_673($3 + ($$2242302 << 3) | 0, $352, $2); //@line 7129
      $356 = $$2242302 + 1 | 0; //@line 7130
      if (($$2242302 | 0) < 9) {
       $$2242302 = $356; //@line 7133
      } else {
       $$2242$lcssa = $356; //@line 7135
       break;
      }
     }
     if (($$2242$lcssa | 0) < 10) {
      $$3300 = $$2242$lcssa; //@line 7141
      while (1) {
       if (HEAP32[$4 + ($$3300 << 2) >> 2] | 0) {
        $$0 = -1; //@line 7147
        break L116;
       }
       if (($$3300 | 0) < 9) {
        $$3300 = $$3300 + 1 | 0; //@line 7153
       } else {
        $$0 = 1; //@line 7155
        break;
       }
      }
     } else {
      $$0 = 1; //@line 7160
     }
    }
   } else {
    $$0 = $$1248; //@line 7164
   }
  }
 } while (0);
 STACKTOP = sp; //@line 7168
 return $$0 | 0; //@line 7168
}
function _mbed_vtracef($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$0199 = 0, $$1$off0 = 0, $$10 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$13 = 0, $$18 = 0, $$3 = 0, $$3147 = 0, $$3147168 = 0, $$3154 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$6 = 0, $$6150 = 0, $$9 = 0, $$lobit = 0, $$pre = 0, $$sink = 0, $125 = 0, $126 = 0, $151 = 0, $157 = 0, $168 = 0, $169 = 0, $171 = 0, $181 = 0, $182 = 0, $184 = 0, $186 = 0, $194 = 0, $201 = 0, $202 = 0, $204 = 0, $206 = 0, $209 = 0, $34 = 0, $38 = 0, $4 = 0, $43 = 0, $5 = 0, $54 = 0, $55 = 0, $59 = 0, $60 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $69 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $76 = 0, $78 = 0, $82 = 0, $89 = 0, $95 = 0, $AsyncCtx = 0, $AsyncCtx27 = 0, $AsyncCtx30 = 0, $AsyncCtx34 = 0, $AsyncCtx38 = 0, $AsyncCtx42 = 0, $AsyncCtx45 = 0, $AsyncCtx49 = 0, $AsyncCtx52 = 0, $AsyncCtx56 = 0, $AsyncCtx60 = 0, $AsyncCtx64 = 0, $extract$t159 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer18 = 0, $vararg_buffer20 = 0, $vararg_buffer23 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 284
 STACKTOP = STACKTOP + 96 | 0; //@line 285
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(96); //@line 285
 $vararg_buffer23 = sp + 72 | 0; //@line 286
 $vararg_buffer20 = sp + 64 | 0; //@line 287
 $vararg_buffer18 = sp + 56 | 0; //@line 288
 $vararg_buffer15 = sp + 48 | 0; //@line 289
 $vararg_buffer12 = sp + 40 | 0; //@line 290
 $vararg_buffer9 = sp + 32 | 0; //@line 291
 $vararg_buffer6 = sp + 24 | 0; //@line 292
 $vararg_buffer3 = sp + 16 | 0; //@line 293
 $vararg_buffer1 = sp + 8 | 0; //@line 294
 $vararg_buffer = sp; //@line 295
 $4 = sp + 80 | 0; //@line 296
 $5 = HEAP32[37] | 0; //@line 297
 do {
  if ($5 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(104, sp) | 0; //@line 301
   FUNCTION_TABLE_v[$5 & 0](); //@line 302
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 9; //@line 305
    HEAP32[$AsyncCtx + 4 >> 2] = $4; //@line 307
    HEAP32[$AsyncCtx + 8 >> 2] = $3; //@line 309
    HEAP32[$AsyncCtx + 12 >> 2] = $2; //@line 311
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer12; //@line 313
    HEAP32[$AsyncCtx + 20 >> 2] = $1; //@line 315
    HEAP32[$AsyncCtx + 24 >> 2] = $vararg_buffer12; //@line 317
    HEAP32[$AsyncCtx + 28 >> 2] = $vararg_buffer9; //@line 319
    HEAP32[$AsyncCtx + 32 >> 2] = $vararg_buffer9; //@line 321
    HEAP32[$AsyncCtx + 36 >> 2] = $vararg_buffer6; //@line 323
    HEAP32[$AsyncCtx + 40 >> 2] = $vararg_buffer6; //@line 325
    HEAP32[$AsyncCtx + 44 >> 2] = $vararg_buffer18; //@line 327
    HEAP32[$AsyncCtx + 48 >> 2] = $vararg_buffer18; //@line 329
    HEAP8[$AsyncCtx + 52 >> 0] = $0; //@line 331
    HEAP32[$AsyncCtx + 56 >> 2] = $vararg_buffer15; //@line 333
    HEAP32[$AsyncCtx + 60 >> 2] = $vararg_buffer15; //@line 335
    HEAP32[$AsyncCtx + 64 >> 2] = $vararg_buffer23; //@line 337
    HEAP32[$AsyncCtx + 68 >> 2] = $vararg_buffer23; //@line 339
    HEAP32[$AsyncCtx + 72 >> 2] = $vararg_buffer3; //@line 341
    HEAP32[$AsyncCtx + 76 >> 2] = $vararg_buffer3; //@line 343
    HEAP32[$AsyncCtx + 80 >> 2] = $vararg_buffer20; //@line 345
    HEAP32[$AsyncCtx + 84 >> 2] = $vararg_buffer20; //@line 347
    HEAP32[$AsyncCtx + 88 >> 2] = $vararg_buffer; //@line 349
    HEAP32[$AsyncCtx + 92 >> 2] = $vararg_buffer; //@line 351
    HEAP32[$AsyncCtx + 96 >> 2] = $vararg_buffer1; //@line 353
    HEAP32[$AsyncCtx + 100 >> 2] = $vararg_buffer1; //@line 355
    sp = STACKTOP; //@line 356
    STACKTOP = sp; //@line 357
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 359
    HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 362
    break;
   }
  }
 } while (0);
 $34 = HEAP32[28] | 0; //@line 367
 do {
  if ($34 | 0) {
   HEAP8[$34 >> 0] = 0; //@line 371
   do {
    if ($0 << 24 >> 24 > -1 & ($1 | 0) != 0) {
     $38 = HEAP32[25] | 0; //@line 377
     if (HEAP8[$38 >> 0] | 0) {
      if (_strstr($38, $1) | 0) {
       $$0$i = 1; //@line 384
       break;
      }
     }
     $43 = HEAP32[26] | 0; //@line 388
     if (!(HEAP8[$43 >> 0] | 0)) {
      label = 11; //@line 392
     } else {
      if (!(_strstr($43, $1) | 0)) {
       $$0$i = 1; //@line 397
      } else {
       label = 11; //@line 399
      }
     }
    } else {
     label = 11; //@line 403
    }
   } while (0);
   if ((label | 0) == 11) {
    $$0$i = 0; //@line 407
   }
   if (!((HEAP32[35] | 0) != 0 & ((($1 | 0) == 0 | (($2 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[32] = HEAP32[30]; //@line 419
    break;
   }
   $54 = HEAPU8[96] | 0; //@line 423
   $55 = $0 & 255; //@line 424
   if ($55 & 31 & $54 | 0) {
    $59 = $54 & 64; //@line 429
    $$lobit = $59 >>> 6; //@line 430
    $60 = $$lobit & 255; //@line 431
    $64 = ($54 & 32 | 0) == 0; //@line 435
    $65 = HEAP32[29] | 0; //@line 436
    $66 = HEAP32[28] | 0; //@line 437
    $67 = $0 << 24 >> 24 == 1; //@line 438
    do {
     if ($67 | ($54 & 128 | 0) != 0) {
      $AsyncCtx64 = _emscripten_alloc_async_context(8, sp) | 0; //@line 442
      _vsnprintf($66, $65, $2, $3) | 0; //@line 443
      if (___async) {
       HEAP32[$AsyncCtx64 >> 2] = 10; //@line 446
       HEAP8[$AsyncCtx64 + 4 >> 0] = $67 & 1; //@line 449
       sp = STACKTOP; //@line 450
       STACKTOP = sp; //@line 451
       return;
      }
      _emscripten_free_async_context($AsyncCtx64 | 0); //@line 453
      $69 = HEAP32[36] | 0; //@line 454
      if (!($67 & ($69 | 0) != 0)) {
       $73 = HEAP32[35] | 0; //@line 458
       $74 = HEAP32[28] | 0; //@line 459
       $AsyncCtx34 = _emscripten_alloc_async_context(4, sp) | 0; //@line 460
       FUNCTION_TABLE_vi[$73 & 127]($74); //@line 461
       if (___async) {
        HEAP32[$AsyncCtx34 >> 2] = 13; //@line 464
        sp = STACKTOP; //@line 465
        STACKTOP = sp; //@line 466
        return;
       } else {
        _emscripten_free_async_context($AsyncCtx34 | 0); //@line 468
        break;
       }
      }
      $71 = HEAP32[28] | 0; //@line 472
      $AsyncCtx27 = _emscripten_alloc_async_context(4, sp) | 0; //@line 473
      FUNCTION_TABLE_vi[$69 & 127]($71); //@line 474
      if (___async) {
       HEAP32[$AsyncCtx27 >> 2] = 11; //@line 477
       sp = STACKTOP; //@line 478
       STACKTOP = sp; //@line 479
       return;
      }
      _emscripten_free_async_context($AsyncCtx27 | 0); //@line 481
      $72 = HEAP32[36] | 0; //@line 482
      $AsyncCtx30 = _emscripten_alloc_async_context(4, sp) | 0; //@line 483
      FUNCTION_TABLE_vi[$72 & 127](952); //@line 484
      if (___async) {
       HEAP32[$AsyncCtx30 >> 2] = 12; //@line 487
       sp = STACKTOP; //@line 488
       STACKTOP = sp; //@line 489
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx30 | 0); //@line 491
       break;
      }
     } else {
      if (!$59) {
       $$1$off0 = ($$lobit | 0) != 0; //@line 498
       $$1143 = $66; //@line 498
       $$1145 = $65; //@line 498
       $$3154 = 0; //@line 498
       label = 38; //@line 499
      } else {
       if ($64) {
        $$0142 = $66; //@line 502
        $$0144 = $65; //@line 502
       } else {
        $76 = _snprintf($66, $65, 954, $vararg_buffer) | 0; //@line 504
        $$ = ($76 | 0) >= ($65 | 0) ? 0 : $76; //@line 506
        $78 = ($$ | 0) > 0; //@line 507
        $$0142 = $78 ? $66 + $$ | 0 : $66; //@line 512
        $$0144 = $65 - ($78 ? $$ : 0) | 0; //@line 512
       }
       if (($$0144 | 0) > 0) {
        $82 = $55 + -2 | 0; //@line 516
        switch ($82 >>> 1 | $82 << 31 | 0) {
        case 0:
         {
          $$sink = 972; //@line 522
          label = 35; //@line 523
          break;
         }
        case 1:
         {
          $$sink = 978; //@line 527
          label = 35; //@line 528
          break;
         }
        case 3:
         {
          $$sink = 966; //@line 532
          label = 35; //@line 533
          break;
         }
        case 7:
         {
          $$sink = 960; //@line 537
          label = 35; //@line 538
          break;
         }
        default:
         {
          $$0141 = 0; //@line 542
          $$1152 = 0; //@line 542
         }
        }
        if ((label | 0) == 35) {
         HEAP32[$vararg_buffer1 >> 2] = $$sink; //@line 546
         $$0141 = $60 & 1; //@line 549
         $$1152 = _snprintf($$0142, $$0144, 984, $vararg_buffer1) | 0; //@line 549
        }
        $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 552
        $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 554
        if (($$1152$ | 0) > 0) {
         $89 = $$0141 << 24 >> 24 == 0; //@line 556
         $$1$off0 = $extract$t159; //@line 561
         $$1143 = $89 ? $$0142 : $$0142 + $$1152$ | 0; //@line 561
         $$1145 = $$0144 - ($89 ? 0 : $$1152$) | 0; //@line 561
         $$3154 = $$1152; //@line 561
         label = 38; //@line 562
        } else {
         $$1$off0 = $extract$t159; //@line 564
         $$1143 = $$0142; //@line 564
         $$1145 = $$0144; //@line 564
         $$3154 = $$1152$; //@line 564
         label = 38; //@line 565
        }
       }
      }
      L54 : do {
       if ((label | 0) == 38) {
        do {
         if (($$1145 | 0) > 0 & (HEAP32[33] | 0) != 0) {
          HEAP32[$4 >> 2] = HEAP32[$3 >> 2]; //@line 578
          $AsyncCtx60 = _emscripten_alloc_async_context(104, sp) | 0; //@line 579
          $95 = _vsnprintf(0, 0, $2, $4) | 0; //@line 580
          if (___async) {
           HEAP32[$AsyncCtx60 >> 2] = 14; //@line 583
           HEAP32[$AsyncCtx60 + 4 >> 2] = $vararg_buffer12; //@line 585
           HEAP32[$AsyncCtx60 + 8 >> 2] = $1; //@line 587
           HEAP32[$AsyncCtx60 + 12 >> 2] = $vararg_buffer12; //@line 589
           HEAP32[$AsyncCtx60 + 16 >> 2] = $vararg_buffer9; //@line 591
           HEAP32[$AsyncCtx60 + 20 >> 2] = $vararg_buffer9; //@line 593
           HEAP32[$AsyncCtx60 + 24 >> 2] = $vararg_buffer6; //@line 595
           HEAP32[$AsyncCtx60 + 28 >> 2] = $vararg_buffer6; //@line 597
           HEAP32[$AsyncCtx60 + 32 >> 2] = $$1143; //@line 599
           HEAP32[$AsyncCtx60 + 36 >> 2] = $$1145; //@line 601
           HEAP32[$AsyncCtx60 + 40 >> 2] = $55; //@line 603
           HEAP32[$AsyncCtx60 + 44 >> 2] = $2; //@line 605
           HEAP32[$AsyncCtx60 + 48 >> 2] = $3; //@line 607
           HEAP32[$AsyncCtx60 + 52 >> 2] = $vararg_buffer18; //@line 609
           HEAP32[$AsyncCtx60 + 56 >> 2] = $vararg_buffer18; //@line 611
           HEAP32[$AsyncCtx60 + 60 >> 2] = $vararg_buffer15; //@line 613
           HEAP32[$AsyncCtx60 + 64 >> 2] = $vararg_buffer15; //@line 615
           HEAP32[$AsyncCtx60 + 68 >> 2] = $vararg_buffer23; //@line 617
           HEAP32[$AsyncCtx60 + 72 >> 2] = $vararg_buffer23; //@line 619
           HEAP32[$AsyncCtx60 + 76 >> 2] = $$3154; //@line 621
           HEAP32[$AsyncCtx60 + 80 >> 2] = $vararg_buffer3; //@line 623
           HEAP32[$AsyncCtx60 + 84 >> 2] = $vararg_buffer3; //@line 625
           HEAP32[$AsyncCtx60 + 88 >> 2] = $4; //@line 627
           HEAP8[$AsyncCtx60 + 92 >> 0] = $$1$off0 & 1; //@line 630
           HEAP32[$AsyncCtx60 + 96 >> 2] = $vararg_buffer20; //@line 632
           HEAP32[$AsyncCtx60 + 100 >> 2] = $vararg_buffer20; //@line 634
           sp = STACKTOP; //@line 635
           STACKTOP = sp; //@line 636
           return;
          }
          _emscripten_free_async_context($AsyncCtx60 | 0); //@line 638
          $125 = HEAP32[33] | 0; //@line 643
          $AsyncCtx38 = _emscripten_alloc_async_context(100, sp) | 0; //@line 644
          $126 = FUNCTION_TABLE_ii[$125 & 1](($$3154 | 0 ? 4 : 0) + $$3154 + $95 | 0) | 0; //@line 645
          if (___async) {
           HEAP32[$AsyncCtx38 >> 2] = 15; //@line 648
           HEAP32[$AsyncCtx38 + 4 >> 2] = $vararg_buffer12; //@line 650
           HEAP32[$AsyncCtx38 + 8 >> 2] = $1; //@line 652
           HEAP32[$AsyncCtx38 + 12 >> 2] = $vararg_buffer12; //@line 654
           HEAP32[$AsyncCtx38 + 16 >> 2] = $vararg_buffer9; //@line 656
           HEAP32[$AsyncCtx38 + 20 >> 2] = $vararg_buffer9; //@line 658
           HEAP32[$AsyncCtx38 + 24 >> 2] = $vararg_buffer6; //@line 660
           HEAP32[$AsyncCtx38 + 28 >> 2] = $vararg_buffer6; //@line 662
           HEAP32[$AsyncCtx38 + 32 >> 2] = $$1143; //@line 664
           HEAP32[$AsyncCtx38 + 36 >> 2] = $$1145; //@line 666
           HEAP32[$AsyncCtx38 + 40 >> 2] = $55; //@line 668
           HEAP32[$AsyncCtx38 + 44 >> 2] = $2; //@line 670
           HEAP32[$AsyncCtx38 + 48 >> 2] = $3; //@line 672
           HEAP32[$AsyncCtx38 + 52 >> 2] = $vararg_buffer18; //@line 674
           HEAP32[$AsyncCtx38 + 56 >> 2] = $vararg_buffer18; //@line 676
           HEAP32[$AsyncCtx38 + 60 >> 2] = $vararg_buffer15; //@line 678
           HEAP32[$AsyncCtx38 + 64 >> 2] = $vararg_buffer15; //@line 680
           HEAP32[$AsyncCtx38 + 68 >> 2] = $vararg_buffer23; //@line 682
           HEAP32[$AsyncCtx38 + 72 >> 2] = $vararg_buffer23; //@line 684
           HEAP32[$AsyncCtx38 + 76 >> 2] = $vararg_buffer3; //@line 686
           HEAP32[$AsyncCtx38 + 80 >> 2] = $vararg_buffer3; //@line 688
           HEAP32[$AsyncCtx38 + 84 >> 2] = $4; //@line 690
           HEAP8[$AsyncCtx38 + 88 >> 0] = $$1$off0 & 1; //@line 693
           HEAP32[$AsyncCtx38 + 92 >> 2] = $vararg_buffer20; //@line 695
           HEAP32[$AsyncCtx38 + 96 >> 2] = $vararg_buffer20; //@line 697
           sp = STACKTOP; //@line 698
           STACKTOP = sp; //@line 699
           return;
          } else {
           _emscripten_free_async_context($AsyncCtx38 | 0); //@line 701
           HEAP32[$vararg_buffer3 >> 2] = $126; //@line 702
           $151 = _snprintf($$1143, $$1145, 984, $vararg_buffer3) | 0; //@line 703
           $$10 = ($151 | 0) >= ($$1145 | 0) ? 0 : $151; //@line 705
           if (($$10 | 0) > 0) {
            $$3 = $$1143 + $$10 | 0; //@line 710
            $$3147 = $$1145 - $$10 | 0; //@line 710
            label = 44; //@line 711
            break;
           } else {
            $$3147168 = $$1145; //@line 714
            $$3169 = $$1143; //@line 714
            break;
           }
          }
         } else {
          $$3 = $$1143; //@line 719
          $$3147 = $$1145; //@line 719
          label = 44; //@line 720
         }
        } while (0);
        if ((label | 0) == 44) {
         if (($$3147 | 0) > 0) {
          $$3147168 = $$3147; //@line 726
          $$3169 = $$3; //@line 726
         } else {
          break;
         }
        }
        $157 = $55 + -2 | 0; //@line 731
        switch ($157 >>> 1 | $157 << 31 | 0) {
        case 0:
         {
          HEAP32[$vararg_buffer6 >> 2] = $1; //@line 737
          $$5156 = _snprintf($$3169, $$3147168, 987, $vararg_buffer6) | 0; //@line 739
          break;
         }
        case 1:
         {
          HEAP32[$vararg_buffer9 >> 2] = $1; //@line 743
          $$5156 = _snprintf($$3169, $$3147168, 1002, $vararg_buffer9) | 0; //@line 745
          break;
         }
        case 3:
         {
          HEAP32[$vararg_buffer12 >> 2] = $1; //@line 749
          $$5156 = _snprintf($$3169, $$3147168, 1017, $vararg_buffer12) | 0; //@line 751
          break;
         }
        case 7:
         {
          HEAP32[$vararg_buffer15 >> 2] = $1; //@line 755
          $$5156 = _snprintf($$3169, $$3147168, 1032, $vararg_buffer15) | 0; //@line 757
          break;
         }
        default:
         {
          $$5156 = _snprintf($$3169, $$3147168, 1047, $vararg_buffer18) | 0; //@line 762
         }
        }
        $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 766
        $168 = $$3169 + $$5156$ | 0; //@line 768
        $169 = $$3147168 - $$5156$ | 0; //@line 769
        if (($$5156$ | 0) > 0 & ($169 | 0) > 0) {
         $AsyncCtx56 = _emscripten_alloc_async_context(32, sp) | 0; //@line 773
         $171 = _vsnprintf($168, $169, $2, $3) | 0; //@line 774
         if (___async) {
          HEAP32[$AsyncCtx56 >> 2] = 16; //@line 777
          HEAP32[$AsyncCtx56 + 4 >> 2] = $169; //@line 779
          HEAP32[$AsyncCtx56 + 8 >> 2] = $168; //@line 781
          HEAP32[$AsyncCtx56 + 12 >> 2] = $vararg_buffer23; //@line 783
          HEAP32[$AsyncCtx56 + 16 >> 2] = $vararg_buffer23; //@line 785
          HEAP8[$AsyncCtx56 + 20 >> 0] = $$1$off0 & 1; //@line 788
          HEAP32[$AsyncCtx56 + 24 >> 2] = $vararg_buffer20; //@line 790
          HEAP32[$AsyncCtx56 + 28 >> 2] = $vararg_buffer20; //@line 792
          sp = STACKTOP; //@line 793
          STACKTOP = sp; //@line 794
          return;
         }
         _emscripten_free_async_context($AsyncCtx56 | 0); //@line 796
         $$13 = ($171 | 0) >= ($169 | 0) ? 0 : $171; //@line 798
         $181 = $168 + $$13 | 0; //@line 800
         $182 = $169 - $$13 | 0; //@line 801
         if (($$13 | 0) > 0) {
          $184 = HEAP32[34] | 0; //@line 804
          do {
           if (($182 | 0) > 0 & ($184 | 0) != 0) {
            $AsyncCtx42 = _emscripten_alloc_async_context(32, sp) | 0; //@line 809
            $186 = FUNCTION_TABLE_i[$184 & 0]() | 0; //@line 810
            if (___async) {
             HEAP32[$AsyncCtx42 >> 2] = 17; //@line 813
             HEAP32[$AsyncCtx42 + 4 >> 2] = $vararg_buffer20; //@line 815
             HEAP32[$AsyncCtx42 + 8 >> 2] = $181; //@line 817
             HEAP32[$AsyncCtx42 + 12 >> 2] = $182; //@line 819
             HEAP32[$AsyncCtx42 + 16 >> 2] = $vararg_buffer20; //@line 821
             HEAP8[$AsyncCtx42 + 20 >> 0] = $$1$off0 & 1; //@line 824
             HEAP32[$AsyncCtx42 + 24 >> 2] = $vararg_buffer23; //@line 826
             HEAP32[$AsyncCtx42 + 28 >> 2] = $vararg_buffer23; //@line 828
             sp = STACKTOP; //@line 829
             STACKTOP = sp; //@line 830
             return;
            } else {
             _emscripten_free_async_context($AsyncCtx42 | 0); //@line 832
             HEAP32[$vararg_buffer20 >> 2] = $186; //@line 833
             $194 = _snprintf($181, $182, 984, $vararg_buffer20) | 0; //@line 834
             $$18 = ($194 | 0) >= ($182 | 0) ? 0 : $194; //@line 836
             if (($$18 | 0) > 0) {
              $$6 = $181 + $$18 | 0; //@line 841
              $$6150 = $182 - $$18 | 0; //@line 841
              $$9 = $$18; //@line 841
              break;
             } else {
              break L54;
             }
            }
           } else {
            $$6 = $181; //@line 848
            $$6150 = $182; //@line 848
            $$9 = $$13; //@line 848
           }
          } while (0);
          if (!(($$9 | 0) < 1 | ($$6150 | 0) < 1 | $$1$off0 ^ 1)) {
           _snprintf($$6, $$6150, 1062, $vararg_buffer23) | 0; //@line 857
          }
         }
        }
       }
      } while (0);
      $201 = HEAP32[35] | 0; //@line 863
      $202 = HEAP32[28] | 0; //@line 864
      $AsyncCtx45 = _emscripten_alloc_async_context(4, sp) | 0; //@line 865
      FUNCTION_TABLE_vi[$201 & 127]($202); //@line 866
      if (___async) {
       HEAP32[$AsyncCtx45 >> 2] = 18; //@line 869
       sp = STACKTOP; //@line 870
       STACKTOP = sp; //@line 871
       return;
      } else {
       _emscripten_free_async_context($AsyncCtx45 | 0); //@line 873
       break;
      }
     }
    } while (0);
    HEAP32[32] = HEAP32[30]; //@line 879
   }
  }
 } while (0);
 $204 = HEAP32[38] | 0; //@line 883
 if (!$204) {
  STACKTOP = sp; //@line 886
  return;
 }
 $206 = HEAP32[39] | 0; //@line 888
 HEAP32[39] = 0; //@line 889
 $AsyncCtx49 = _emscripten_alloc_async_context(8, sp) | 0; //@line 890
 FUNCTION_TABLE_v[$204 & 0](); //@line 891
 if (___async) {
  HEAP32[$AsyncCtx49 >> 2] = 19; //@line 894
  HEAP32[$AsyncCtx49 + 4 >> 2] = $206; //@line 896
  sp = STACKTOP; //@line 897
  STACKTOP = sp; //@line 898
  return;
 }
 _emscripten_free_async_context($AsyncCtx49 | 0); //@line 900
 if (($206 | 0) > 1) {
  $$0199 = $206; //@line 903
 } else {
  STACKTOP = sp; //@line 905
  return;
 }
 while (1) {
  $209 = $$0199 + -1 | 0; //@line 908
  $$pre = HEAP32[38] | 0; //@line 909
  $AsyncCtx52 = _emscripten_alloc_async_context(12, sp) | 0; //@line 910
  FUNCTION_TABLE_v[$$pre & 0](); //@line 911
  if (___async) {
   label = 70; //@line 914
   break;
  }
  _emscripten_free_async_context($AsyncCtx52 | 0); //@line 917
  if (($$0199 | 0) > 2) {
   $$0199 = $209; //@line 920
  } else {
   label = 72; //@line 922
   break;
  }
 }
 if ((label | 0) == 70) {
  HEAP32[$AsyncCtx52 >> 2] = 20; //@line 927
  HEAP32[$AsyncCtx52 + 4 >> 2] = $$0199; //@line 929
  HEAP32[$AsyncCtx52 + 8 >> 2] = $209; //@line 931
  sp = STACKTOP; //@line 932
  STACKTOP = sp; //@line 933
  return;
 } else if ((label | 0) == 72) {
  STACKTOP = sp; //@line 936
  return;
 }
}
function _mbed_vtracef__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $$0$i = 0, $$0141 = 0, $$0142 = 0, $$0144 = 0, $$1$off0 = 0, $$1$off0$expand_i1_val = 0, $$1$off0$expand_i1_val18 = 0, $$1143 = 0, $$1145 = 0, $$1152 = 0, $$1152$ = 0, $$3154 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $$lobit = 0, $$sink = 0, $10 = 0, $102 = 0, $108 = 0, $109 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $136 = 0, $14 = 0, $147 = 0, $148 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $163 = 0, $164 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $48 = 0, $53 = 0, $57 = 0, $6 = 0, $62 = 0, $73 = 0, $74 = 0, $78 = 0, $79 = 0, $8 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $89 = 0, $91 = 0, $95 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx11 = 0, $ReallocAsyncCtx12 = 0, $ReallocAsyncCtx7 = 0, $ReallocAsyncCtx8 = 0, $extract$t159 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 11717
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11719
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11721
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11723
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11725
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11727
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11729
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 11731
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 11733
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 11735
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 11737
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 11739
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 11741
 $26 = HEAP8[$0 + 52 >> 0] | 0; //@line 11743
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 11745
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 11747
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 11749
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 11751
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 11753
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 11755
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 11757
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 11759
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 11761
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 11765
 HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 11770
 $53 = HEAP32[28] | 0; //@line 11771
 do {
  if ($53 | 0) {
   HEAP8[$53 >> 0] = 0; //@line 11775
   do {
    if ($26 << 24 >> 24 > -1 & ($10 | 0) != 0) {
     $57 = HEAP32[25] | 0; //@line 11781
     if (HEAP8[$57 >> 0] | 0) {
      if (_strstr($57, $10) | 0) {
       $$0$i = 1; //@line 11788
       break;
      }
     }
     $62 = HEAP32[26] | 0; //@line 11792
     if (!(HEAP8[$62 >> 0] | 0)) {
      label = 9; //@line 11796
     } else {
      if (!(_strstr($62, $10) | 0)) {
       $$0$i = 1; //@line 11801
      } else {
       label = 9; //@line 11803
      }
     }
    } else {
     label = 9; //@line 11807
    }
   } while (0);
   if ((label | 0) == 9) {
    $$0$i = 0; //@line 11811
   }
   if (!((HEAP32[35] | 0) != 0 & ((($10 | 0) == 0 | (($6 | 0) == 0 | $$0$i)) ^ 1))) {
    HEAP32[32] = HEAP32[30]; //@line 11823
    break;
   }
   $73 = HEAPU8[96] | 0; //@line 11827
   $74 = $26 & 255; //@line 11828
   if ($74 & 31 & $73 | 0) {
    $78 = $73 & 64; //@line 11833
    $$lobit = $78 >>> 6; //@line 11834
    $79 = $$lobit & 255; //@line 11835
    $83 = ($73 & 32 | 0) == 0; //@line 11839
    $84 = HEAP32[29] | 0; //@line 11840
    $85 = HEAP32[28] | 0; //@line 11841
    $86 = $26 << 24 >> 24 == 1; //@line 11842
    if ($86 | ($73 & 128 | 0) != 0) {
     $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 11845
     _vsnprintf($85, $84, $6, $4) | 0; //@line 11846
     if (___async) {
      HEAP32[$ReallocAsyncCtx12 >> 2] = 10; //@line 11849
      $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 11850
      $$expand_i1_val = $86 & 1; //@line 11851
      HEAP8[$87 >> 0] = $$expand_i1_val; //@line 11852
      sp = STACKTOP; //@line 11853
      return;
     }
     ___async_unwind = 0; //@line 11856
     HEAP32[$ReallocAsyncCtx12 >> 2] = 10; //@line 11857
     $87 = $ReallocAsyncCtx12 + 4 | 0; //@line 11858
     $$expand_i1_val = $86 & 1; //@line 11859
     HEAP8[$87 >> 0] = $$expand_i1_val; //@line 11860
     sp = STACKTOP; //@line 11861
     return;
    }
    if (!$78) {
     $$1$off0 = ($$lobit | 0) != 0; //@line 11867
     $$1143 = $85; //@line 11867
     $$1145 = $84; //@line 11867
     $$3154 = 0; //@line 11867
     label = 28; //@line 11868
    } else {
     if ($83) {
      $$0142 = $85; //@line 11871
      $$0144 = $84; //@line 11871
     } else {
      $89 = _snprintf($85, $84, 954, $44) | 0; //@line 11873
      $$ = ($89 | 0) >= ($84 | 0) ? 0 : $89; //@line 11875
      $91 = ($$ | 0) > 0; //@line 11876
      $$0142 = $91 ? $85 + $$ | 0 : $85; //@line 11881
      $$0144 = $84 - ($91 ? $$ : 0) | 0; //@line 11881
     }
     if (($$0144 | 0) > 0) {
      $95 = $74 + -2 | 0; //@line 11885
      switch ($95 >>> 1 | $95 << 31 | 0) {
      case 0:
       {
        $$sink = 972; //@line 11891
        label = 25; //@line 11892
        break;
       }
      case 1:
       {
        $$sink = 978; //@line 11896
        label = 25; //@line 11897
        break;
       }
      case 3:
       {
        $$sink = 966; //@line 11901
        label = 25; //@line 11902
        break;
       }
      case 7:
       {
        $$sink = 960; //@line 11906
        label = 25; //@line 11907
        break;
       }
      default:
       {
        $$0141 = 0; //@line 11911
        $$1152 = 0; //@line 11911
       }
      }
      if ((label | 0) == 25) {
       HEAP32[$48 >> 2] = $$sink; //@line 11915
       $$0141 = $79 & 1; //@line 11918
       $$1152 = _snprintf($$0142, $$0144, 984, $48) | 0; //@line 11918
      }
      $$1152$ = ($$1152 | 0) < ($$0144 | 0) ? $$1152 : 0; //@line 11921
      $extract$t159 = $$0141 << 24 >> 24 != 0; //@line 11923
      if (($$1152$ | 0) > 0) {
       $102 = $$0141 << 24 >> 24 == 0; //@line 11925
       $$1$off0 = $extract$t159; //@line 11930
       $$1143 = $102 ? $$0142 : $$0142 + $$1152$ | 0; //@line 11930
       $$1145 = $$0144 - ($102 ? 0 : $$1152$) | 0; //@line 11930
       $$3154 = $$1152; //@line 11930
       label = 28; //@line 11931
      } else {
       $$1$off0 = $extract$t159; //@line 11933
       $$1143 = $$0142; //@line 11933
       $$1145 = $$0144; //@line 11933
       $$3154 = $$1152$; //@line 11933
       label = 28; //@line 11934
      }
     }
    }
    if ((label | 0) == 28) {
     if (($$1145 | 0) > 0 & (HEAP32[33] | 0) != 0) {
      HEAP32[$2 >> 2] = HEAP32[$4 >> 2]; //@line 11945
      $ReallocAsyncCtx11 = _emscripten_realloc_async_context(104) | 0; //@line 11946
      $108 = _vsnprintf(0, 0, $6, $2) | 0; //@line 11947
      if (___async) {
       HEAP32[$ReallocAsyncCtx11 >> 2] = 14; //@line 11950
       $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 11951
       HEAP32[$109 >> 2] = $8; //@line 11952
       $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 11953
       HEAP32[$110 >> 2] = $10; //@line 11954
       $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 11955
       HEAP32[$111 >> 2] = $12; //@line 11956
       $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 11957
       HEAP32[$112 >> 2] = $14; //@line 11958
       $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 11959
       HEAP32[$113 >> 2] = $16; //@line 11960
       $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 11961
       HEAP32[$114 >> 2] = $18; //@line 11962
       $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 11963
       HEAP32[$115 >> 2] = $20; //@line 11964
       $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 11965
       HEAP32[$116 >> 2] = $$1143; //@line 11966
       $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 11967
       HEAP32[$117 >> 2] = $$1145; //@line 11968
       $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 11969
       HEAP32[$118 >> 2] = $74; //@line 11970
       $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 11971
       HEAP32[$119 >> 2] = $6; //@line 11972
       $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 11973
       HEAP32[$120 >> 2] = $4; //@line 11974
       $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 11975
       HEAP32[$121 >> 2] = $22; //@line 11976
       $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 11977
       HEAP32[$122 >> 2] = $24; //@line 11978
       $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 11979
       HEAP32[$123 >> 2] = $28; //@line 11980
       $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 11981
       HEAP32[$124 >> 2] = $30; //@line 11982
       $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 11983
       HEAP32[$125 >> 2] = $32; //@line 11984
       $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 11985
       HEAP32[$126 >> 2] = $34; //@line 11986
       $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 11987
       HEAP32[$127 >> 2] = $$3154; //@line 11988
       $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 11989
       HEAP32[$128 >> 2] = $36; //@line 11990
       $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 11991
       HEAP32[$129 >> 2] = $38; //@line 11992
       $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 11993
       HEAP32[$130 >> 2] = $2; //@line 11994
       $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 11995
       $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 11996
       HEAP8[$131 >> 0] = $$1$off0$expand_i1_val; //@line 11997
       $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 11998
       HEAP32[$132 >> 2] = $40; //@line 11999
       $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 12000
       HEAP32[$133 >> 2] = $42; //@line 12001
       sp = STACKTOP; //@line 12002
       return;
      }
      HEAP32[___async_retval >> 2] = $108; //@line 12006
      ___async_unwind = 0; //@line 12007
      HEAP32[$ReallocAsyncCtx11 >> 2] = 14; //@line 12008
      $109 = $ReallocAsyncCtx11 + 4 | 0; //@line 12009
      HEAP32[$109 >> 2] = $8; //@line 12010
      $110 = $ReallocAsyncCtx11 + 8 | 0; //@line 12011
      HEAP32[$110 >> 2] = $10; //@line 12012
      $111 = $ReallocAsyncCtx11 + 12 | 0; //@line 12013
      HEAP32[$111 >> 2] = $12; //@line 12014
      $112 = $ReallocAsyncCtx11 + 16 | 0; //@line 12015
      HEAP32[$112 >> 2] = $14; //@line 12016
      $113 = $ReallocAsyncCtx11 + 20 | 0; //@line 12017
      HEAP32[$113 >> 2] = $16; //@line 12018
      $114 = $ReallocAsyncCtx11 + 24 | 0; //@line 12019
      HEAP32[$114 >> 2] = $18; //@line 12020
      $115 = $ReallocAsyncCtx11 + 28 | 0; //@line 12021
      HEAP32[$115 >> 2] = $20; //@line 12022
      $116 = $ReallocAsyncCtx11 + 32 | 0; //@line 12023
      HEAP32[$116 >> 2] = $$1143; //@line 12024
      $117 = $ReallocAsyncCtx11 + 36 | 0; //@line 12025
      HEAP32[$117 >> 2] = $$1145; //@line 12026
      $118 = $ReallocAsyncCtx11 + 40 | 0; //@line 12027
      HEAP32[$118 >> 2] = $74; //@line 12028
      $119 = $ReallocAsyncCtx11 + 44 | 0; //@line 12029
      HEAP32[$119 >> 2] = $6; //@line 12030
      $120 = $ReallocAsyncCtx11 + 48 | 0; //@line 12031
      HEAP32[$120 >> 2] = $4; //@line 12032
      $121 = $ReallocAsyncCtx11 + 52 | 0; //@line 12033
      HEAP32[$121 >> 2] = $22; //@line 12034
      $122 = $ReallocAsyncCtx11 + 56 | 0; //@line 12035
      HEAP32[$122 >> 2] = $24; //@line 12036
      $123 = $ReallocAsyncCtx11 + 60 | 0; //@line 12037
      HEAP32[$123 >> 2] = $28; //@line 12038
      $124 = $ReallocAsyncCtx11 + 64 | 0; //@line 12039
      HEAP32[$124 >> 2] = $30; //@line 12040
      $125 = $ReallocAsyncCtx11 + 68 | 0; //@line 12041
      HEAP32[$125 >> 2] = $32; //@line 12042
      $126 = $ReallocAsyncCtx11 + 72 | 0; //@line 12043
      HEAP32[$126 >> 2] = $34; //@line 12044
      $127 = $ReallocAsyncCtx11 + 76 | 0; //@line 12045
      HEAP32[$127 >> 2] = $$3154; //@line 12046
      $128 = $ReallocAsyncCtx11 + 80 | 0; //@line 12047
      HEAP32[$128 >> 2] = $36; //@line 12048
      $129 = $ReallocAsyncCtx11 + 84 | 0; //@line 12049
      HEAP32[$129 >> 2] = $38; //@line 12050
      $130 = $ReallocAsyncCtx11 + 88 | 0; //@line 12051
      HEAP32[$130 >> 2] = $2; //@line 12052
      $131 = $ReallocAsyncCtx11 + 92 | 0; //@line 12053
      $$1$off0$expand_i1_val = $$1$off0 & 1; //@line 12054
      HEAP8[$131 >> 0] = $$1$off0$expand_i1_val; //@line 12055
      $132 = $ReallocAsyncCtx11 + 96 | 0; //@line 12056
      HEAP32[$132 >> 2] = $40; //@line 12057
      $133 = $ReallocAsyncCtx11 + 100 | 0; //@line 12058
      HEAP32[$133 >> 2] = $42; //@line 12059
      sp = STACKTOP; //@line 12060
      return;
     }
     if (($$1145 | 0) > 0) {
      $136 = $74 + -2 | 0; //@line 12065
      switch ($136 >>> 1 | $136 << 31 | 0) {
      case 0:
       {
        HEAP32[$18 >> 2] = $10; //@line 12071
        $$5156 = _snprintf($$1143, $$1145, 987, $18) | 0; //@line 12073
        break;
       }
      case 1:
       {
        HEAP32[$14 >> 2] = $10; //@line 12077
        $$5156 = _snprintf($$1143, $$1145, 1002, $14) | 0; //@line 12079
        break;
       }
      case 3:
       {
        HEAP32[$8 >> 2] = $10; //@line 12083
        $$5156 = _snprintf($$1143, $$1145, 1017, $8) | 0; //@line 12085
        break;
       }
      case 7:
       {
        HEAP32[$28 >> 2] = $10; //@line 12089
        $$5156 = _snprintf($$1143, $$1145, 1032, $28) | 0; //@line 12091
        break;
       }
      default:
       {
        $$5156 = _snprintf($$1143, $$1145, 1047, $22) | 0; //@line 12096
       }
      }
      $$5156$ = ($$5156 | 0) < ($$1145 | 0) ? $$5156 : 0; //@line 12100
      $147 = $$1143 + $$5156$ | 0; //@line 12102
      $148 = $$1145 - $$5156$ | 0; //@line 12103
      if (($$5156$ | 0) > 0 & ($148 | 0) > 0) {
       $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 12107
       $150 = _vsnprintf($147, $148, $6, $4) | 0; //@line 12108
       if (___async) {
        HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 12111
        $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 12112
        HEAP32[$151 >> 2] = $148; //@line 12113
        $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 12114
        HEAP32[$152 >> 2] = $147; //@line 12115
        $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 12116
        HEAP32[$153 >> 2] = $32; //@line 12117
        $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 12118
        HEAP32[$154 >> 2] = $34; //@line 12119
        $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 12120
        $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 12121
        HEAP8[$155 >> 0] = $$1$off0$expand_i1_val18; //@line 12122
        $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 12123
        HEAP32[$156 >> 2] = $40; //@line 12124
        $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 12125
        HEAP32[$157 >> 2] = $42; //@line 12126
        sp = STACKTOP; //@line 12127
        return;
       }
       HEAP32[___async_retval >> 2] = $150; //@line 12131
       ___async_unwind = 0; //@line 12132
       HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 12133
       $151 = $ReallocAsyncCtx10 + 4 | 0; //@line 12134
       HEAP32[$151 >> 2] = $148; //@line 12135
       $152 = $ReallocAsyncCtx10 + 8 | 0; //@line 12136
       HEAP32[$152 >> 2] = $147; //@line 12137
       $153 = $ReallocAsyncCtx10 + 12 | 0; //@line 12138
       HEAP32[$153 >> 2] = $32; //@line 12139
       $154 = $ReallocAsyncCtx10 + 16 | 0; //@line 12140
       HEAP32[$154 >> 2] = $34; //@line 12141
       $155 = $ReallocAsyncCtx10 + 20 | 0; //@line 12142
       $$1$off0$expand_i1_val18 = $$1$off0 & 1; //@line 12143
       HEAP8[$155 >> 0] = $$1$off0$expand_i1_val18; //@line 12144
       $156 = $ReallocAsyncCtx10 + 24 | 0; //@line 12145
       HEAP32[$156 >> 2] = $40; //@line 12146
       $157 = $ReallocAsyncCtx10 + 28 | 0; //@line 12147
       HEAP32[$157 >> 2] = $42; //@line 12148
       sp = STACKTOP; //@line 12149
       return;
      }
     }
    }
    $159 = HEAP32[35] | 0; //@line 12154
    $160 = HEAP32[28] | 0; //@line 12155
    $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12156
    FUNCTION_TABLE_vi[$159 & 127]($160); //@line 12157
    if (___async) {
     HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12160
     sp = STACKTOP; //@line 12161
     return;
    }
    ___async_unwind = 0; //@line 12164
    HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12165
    sp = STACKTOP; //@line 12166
    return;
   }
  }
 } while (0);
 $161 = HEAP32[38] | 0; //@line 12171
 if (!$161) {
  return;
 }
 $163 = HEAP32[39] | 0; //@line 12176
 HEAP32[39] = 0; //@line 12177
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12178
 FUNCTION_TABLE_v[$161 & 0](); //@line 12179
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12182
  $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 12183
  HEAP32[$164 >> 2] = $163; //@line 12184
  sp = STACKTOP; //@line 12185
  return;
 }
 ___async_unwind = 0; //@line 12188
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12189
 $164 = $ReallocAsyncCtx8 + 4 | 0; //@line 12190
 HEAP32[$164 >> 2] = $163; //@line 12191
 sp = STACKTOP; //@line 12192
 return;
}
function _free($0) {
 $0 = $0 | 0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $10 = 0, $105 = 0, $106 = 0, $114 = 0, $115 = 0, $116 = 0, $124 = 0, $13 = 0, $132 = 0, $137 = 0, $138 = 0, $141 = 0, $143 = 0, $145 = 0, $16 = 0, $160 = 0, $165 = 0, $167 = 0, $17 = 0, $170 = 0, $173 = 0, $176 = 0, $179 = 0, $180 = 0, $181 = 0, $183 = 0, $185 = 0, $186 = 0, $188 = 0, $189 = 0, $195 = 0, $196 = 0, $2 = 0, $21 = 0, $210 = 0, $213 = 0, $214 = 0, $220 = 0, $235 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $244 = 0, $245 = 0, $251 = 0, $256 = 0, $257 = 0, $26 = 0, $260 = 0, $262 = 0, $265 = 0, $270 = 0, $276 = 0, $28 = 0, $280 = 0, $281 = 0, $299 = 0, $3 = 0, $301 = 0, $308 = 0, $309 = 0, $310 = 0, $319 = 0, $41 = 0, $46 = 0, $48 = 0, $51 = 0, $53 = 0, $56 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $63 = 0, $65 = 0, $66 = 0, $68 = 0, $69 = 0, $7 = 0, $74 = 0, $75 = 0, $89 = 0, $9 = 0, $92 = 0, $93 = 0, $99 = 0, label = 0;
 if (!$0) {
  return;
 }
 $2 = $0 + -8 | 0; //@line 4040
 $3 = HEAP32[1009] | 0; //@line 4041
 if ($2 >>> 0 < $3 >>> 0) {
  _abort(); //@line 4044
 }
 $6 = HEAP32[$0 + -4 >> 2] | 0; //@line 4048
 $7 = $6 & 3; //@line 4049
 if (($7 | 0) == 1) {
  _abort(); //@line 4052
 }
 $9 = $6 & -8; //@line 4055
 $10 = $2 + $9 | 0; //@line 4056
 L10 : do {
  if (!($6 & 1)) {
   $13 = HEAP32[$2 >> 2] | 0; //@line 4061
   if (!$7) {
    return;
   }
   $16 = $2 + (0 - $13) | 0; //@line 4067
   $17 = $13 + $9 | 0; //@line 4068
   if ($16 >>> 0 < $3 >>> 0) {
    _abort(); //@line 4071
   }
   if ((HEAP32[1010] | 0) == ($16 | 0)) {
    $105 = $10 + 4 | 0; //@line 4077
    $106 = HEAP32[$105 >> 2] | 0; //@line 4078
    if (($106 & 3 | 0) != 3) {
     $$1 = $16; //@line 4082
     $$1382 = $17; //@line 4082
     $114 = $16; //@line 4082
     break;
    }
    HEAP32[1007] = $17; //@line 4085
    HEAP32[$105 >> 2] = $106 & -2; //@line 4087
    HEAP32[$16 + 4 >> 2] = $17 | 1; //@line 4090
    HEAP32[$16 + $17 >> 2] = $17; //@line 4092
    return;
   }
   $21 = $13 >>> 3; //@line 4095
   if ($13 >>> 0 < 256) {
    $24 = HEAP32[$16 + 8 >> 2] | 0; //@line 4099
    $26 = HEAP32[$16 + 12 >> 2] | 0; //@line 4101
    $28 = 4060 + ($21 << 1 << 2) | 0; //@line 4103
    if (($24 | 0) != ($28 | 0)) {
     if ($3 >>> 0 > $24 >>> 0) {
      _abort(); //@line 4108
     }
     if ((HEAP32[$24 + 12 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4115
     }
    }
    if (($26 | 0) == ($24 | 0)) {
     HEAP32[1005] = HEAP32[1005] & ~(1 << $21); //@line 4125
     $$1 = $16; //@line 4126
     $$1382 = $17; //@line 4126
     $114 = $16; //@line 4126
     break;
    }
    if (($26 | 0) == ($28 | 0)) {
     $$pre$phi444Z2D = $26 + 8 | 0; //@line 4132
    } else {
     if ($3 >>> 0 > $26 >>> 0) {
      _abort(); //@line 4136
     }
     $41 = $26 + 8 | 0; //@line 4139
     if ((HEAP32[$41 >> 2] | 0) == ($16 | 0)) {
      $$pre$phi444Z2D = $41; //@line 4143
     } else {
      _abort(); //@line 4145
     }
    }
    HEAP32[$24 + 12 >> 2] = $26; //@line 4150
    HEAP32[$$pre$phi444Z2D >> 2] = $24; //@line 4151
    $$1 = $16; //@line 4152
    $$1382 = $17; //@line 4152
    $114 = $16; //@line 4152
    break;
   }
   $46 = HEAP32[$16 + 24 >> 2] | 0; //@line 4156
   $48 = HEAP32[$16 + 12 >> 2] | 0; //@line 4158
   do {
    if (($48 | 0) == ($16 | 0)) {
     $59 = $16 + 16 | 0; //@line 4162
     $60 = $59 + 4 | 0; //@line 4163
     $61 = HEAP32[$60 >> 2] | 0; //@line 4164
     if (!$61) {
      $63 = HEAP32[$59 >> 2] | 0; //@line 4167
      if (!$63) {
       $$3 = 0; //@line 4170
       break;
      } else {
       $$1387 = $63; //@line 4173
       $$1390 = $59; //@line 4173
      }
     } else {
      $$1387 = $61; //@line 4176
      $$1390 = $60; //@line 4176
     }
     while (1) {
      $65 = $$1387 + 20 | 0; //@line 4179
      $66 = HEAP32[$65 >> 2] | 0; //@line 4180
      if ($66 | 0) {
       $$1387 = $66; //@line 4183
       $$1390 = $65; //@line 4183
       continue;
      }
      $68 = $$1387 + 16 | 0; //@line 4186
      $69 = HEAP32[$68 >> 2] | 0; //@line 4187
      if (!$69) {
       break;
      } else {
       $$1387 = $69; //@line 4192
       $$1390 = $68; //@line 4192
      }
     }
     if ($3 >>> 0 > $$1390 >>> 0) {
      _abort(); //@line 4197
     } else {
      HEAP32[$$1390 >> 2] = 0; //@line 4200
      $$3 = $$1387; //@line 4201
      break;
     }
    } else {
     $51 = HEAP32[$16 + 8 >> 2] | 0; //@line 4206
     if ($3 >>> 0 > $51 >>> 0) {
      _abort(); //@line 4209
     }
     $53 = $51 + 12 | 0; //@line 4212
     if ((HEAP32[$53 >> 2] | 0) != ($16 | 0)) {
      _abort(); //@line 4216
     }
     $56 = $48 + 8 | 0; //@line 4219
     if ((HEAP32[$56 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$53 >> 2] = $48; //@line 4223
      HEAP32[$56 >> 2] = $51; //@line 4224
      $$3 = $48; //@line 4225
      break;
     } else {
      _abort(); //@line 4228
     }
    }
   } while (0);
   if (!$46) {
    $$1 = $16; //@line 4235
    $$1382 = $17; //@line 4235
    $114 = $16; //@line 4235
   } else {
    $74 = HEAP32[$16 + 28 >> 2] | 0; //@line 4238
    $75 = 4324 + ($74 << 2) | 0; //@line 4239
    do {
     if ((HEAP32[$75 >> 2] | 0) == ($16 | 0)) {
      HEAP32[$75 >> 2] = $$3; //@line 4244
      if (!$$3) {
       HEAP32[1006] = HEAP32[1006] & ~(1 << $74); //@line 4251
       $$1 = $16; //@line 4252
       $$1382 = $17; //@line 4252
       $114 = $16; //@line 4252
       break L10;
      }
     } else {
      if ((HEAP32[1009] | 0) >>> 0 > $46 >>> 0) {
       _abort(); //@line 4259
      } else {
       HEAP32[$46 + 16 + (((HEAP32[$46 + 16 >> 2] | 0) != ($16 | 0) & 1) << 2) >> 2] = $$3; //@line 4267
       if (!$$3) {
        $$1 = $16; //@line 4270
        $$1382 = $17; //@line 4270
        $114 = $16; //@line 4270
        break L10;
       } else {
        break;
       }
      }
     }
    } while (0);
    $89 = HEAP32[1009] | 0; //@line 4278
    if ($89 >>> 0 > $$3 >>> 0) {
     _abort(); //@line 4281
    }
    HEAP32[$$3 + 24 >> 2] = $46; //@line 4285
    $92 = $16 + 16 | 0; //@line 4286
    $93 = HEAP32[$92 >> 2] | 0; //@line 4287
    do {
     if ($93 | 0) {
      if ($89 >>> 0 > $93 >>> 0) {
       _abort(); //@line 4293
      } else {
       HEAP32[$$3 + 16 >> 2] = $93; //@line 4297
       HEAP32[$93 + 24 >> 2] = $$3; //@line 4299
       break;
      }
     }
    } while (0);
    $99 = HEAP32[$92 + 4 >> 2] | 0; //@line 4305
    if (!$99) {
     $$1 = $16; //@line 4308
     $$1382 = $17; //@line 4308
     $114 = $16; //@line 4308
    } else {
     if ((HEAP32[1009] | 0) >>> 0 > $99 >>> 0) {
      _abort(); //@line 4313
     } else {
      HEAP32[$$3 + 20 >> 2] = $99; //@line 4317
      HEAP32[$99 + 24 >> 2] = $$3; //@line 4319
      $$1 = $16; //@line 4320
      $$1382 = $17; //@line 4320
      $114 = $16; //@line 4320
      break;
     }
    }
   }
  } else {
   $$1 = $2; //@line 4326
   $$1382 = $9; //@line 4326
   $114 = $2; //@line 4326
  }
 } while (0);
 if ($114 >>> 0 >= $10 >>> 0) {
  _abort(); //@line 4331
 }
 $115 = $10 + 4 | 0; //@line 4334
 $116 = HEAP32[$115 >> 2] | 0; //@line 4335
 if (!($116 & 1)) {
  _abort(); //@line 4339
 }
 if (!($116 & 2)) {
  if ((HEAP32[1011] | 0) == ($10 | 0)) {
   $124 = (HEAP32[1008] | 0) + $$1382 | 0; //@line 4349
   HEAP32[1008] = $124; //@line 4350
   HEAP32[1011] = $$1; //@line 4351
   HEAP32[$$1 + 4 >> 2] = $124 | 1; //@line 4354
   if (($$1 | 0) != (HEAP32[1010] | 0)) {
    return;
   }
   HEAP32[1010] = 0; //@line 4360
   HEAP32[1007] = 0; //@line 4361
   return;
  }
  if ((HEAP32[1010] | 0) == ($10 | 0)) {
   $132 = (HEAP32[1007] | 0) + $$1382 | 0; //@line 4368
   HEAP32[1007] = $132; //@line 4369
   HEAP32[1010] = $114; //@line 4370
   HEAP32[$$1 + 4 >> 2] = $132 | 1; //@line 4373
   HEAP32[$114 + $132 >> 2] = $132; //@line 4375
   return;
  }
  $137 = ($116 & -8) + $$1382 | 0; //@line 4379
  $138 = $116 >>> 3; //@line 4380
  L108 : do {
   if ($116 >>> 0 < 256) {
    $141 = HEAP32[$10 + 8 >> 2] | 0; //@line 4385
    $143 = HEAP32[$10 + 12 >> 2] | 0; //@line 4387
    $145 = 4060 + ($138 << 1 << 2) | 0; //@line 4389
    if (($141 | 0) != ($145 | 0)) {
     if ((HEAP32[1009] | 0) >>> 0 > $141 >>> 0) {
      _abort(); //@line 4395
     }
     if ((HEAP32[$141 + 12 >> 2] | 0) != ($10 | 0)) {
      _abort(); //@line 4402
     }
    }
    if (($143 | 0) == ($141 | 0)) {
     HEAP32[1005] = HEAP32[1005] & ~(1 << $138); //@line 4412
     break;
    }
    if (($143 | 0) == ($145 | 0)) {
     $$pre$phi442Z2D = $143 + 8 | 0; //@line 4418
    } else {
     if ((HEAP32[1009] | 0) >>> 0 > $143 >>> 0) {
      _abort(); //@line 4423
     }
     $160 = $143 + 8 | 0; //@line 4426
     if ((HEAP32[$160 >> 2] | 0) == ($10 | 0)) {
      $$pre$phi442Z2D = $160; //@line 4430
     } else {
      _abort(); //@line 4432
     }
    }
    HEAP32[$141 + 12 >> 2] = $143; //@line 4437
    HEAP32[$$pre$phi442Z2D >> 2] = $141; //@line 4438
   } else {
    $165 = HEAP32[$10 + 24 >> 2] | 0; //@line 4441
    $167 = HEAP32[$10 + 12 >> 2] | 0; //@line 4443
    do {
     if (($167 | 0) == ($10 | 0)) {
      $179 = $10 + 16 | 0; //@line 4447
      $180 = $179 + 4 | 0; //@line 4448
      $181 = HEAP32[$180 >> 2] | 0; //@line 4449
      if (!$181) {
       $183 = HEAP32[$179 >> 2] | 0; //@line 4452
       if (!$183) {
        $$3400 = 0; //@line 4455
        break;
       } else {
        $$1398 = $183; //@line 4458
        $$1402 = $179; //@line 4458
       }
      } else {
       $$1398 = $181; //@line 4461
       $$1402 = $180; //@line 4461
      }
      while (1) {
       $185 = $$1398 + 20 | 0; //@line 4464
       $186 = HEAP32[$185 >> 2] | 0; //@line 4465
       if ($186 | 0) {
        $$1398 = $186; //@line 4468
        $$1402 = $185; //@line 4468
        continue;
       }
       $188 = $$1398 + 16 | 0; //@line 4471
       $189 = HEAP32[$188 >> 2] | 0; //@line 4472
       if (!$189) {
        break;
       } else {
        $$1398 = $189; //@line 4477
        $$1402 = $188; //@line 4477
       }
      }
      if ((HEAP32[1009] | 0) >>> 0 > $$1402 >>> 0) {
       _abort(); //@line 4483
      } else {
       HEAP32[$$1402 >> 2] = 0; //@line 4486
       $$3400 = $$1398; //@line 4487
       break;
      }
     } else {
      $170 = HEAP32[$10 + 8 >> 2] | 0; //@line 4492
      if ((HEAP32[1009] | 0) >>> 0 > $170 >>> 0) {
       _abort(); //@line 4496
      }
      $173 = $170 + 12 | 0; //@line 4499
      if ((HEAP32[$173 >> 2] | 0) != ($10 | 0)) {
       _abort(); //@line 4503
      }
      $176 = $167 + 8 | 0; //@line 4506
      if ((HEAP32[$176 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$173 >> 2] = $167; //@line 4510
       HEAP32[$176 >> 2] = $170; //@line 4511
       $$3400 = $167; //@line 4512
       break;
      } else {
       _abort(); //@line 4515
      }
     }
    } while (0);
    if ($165 | 0) {
     $195 = HEAP32[$10 + 28 >> 2] | 0; //@line 4523
     $196 = 4324 + ($195 << 2) | 0; //@line 4524
     do {
      if ((HEAP32[$196 >> 2] | 0) == ($10 | 0)) {
       HEAP32[$196 >> 2] = $$3400; //@line 4529
       if (!$$3400) {
        HEAP32[1006] = HEAP32[1006] & ~(1 << $195); //@line 4536
        break L108;
       }
      } else {
       if ((HEAP32[1009] | 0) >>> 0 > $165 >>> 0) {
        _abort(); //@line 4543
       } else {
        HEAP32[$165 + 16 + (((HEAP32[$165 + 16 >> 2] | 0) != ($10 | 0) & 1) << 2) >> 2] = $$3400; //@line 4551
        if (!$$3400) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while (0);
     $210 = HEAP32[1009] | 0; //@line 4561
     if ($210 >>> 0 > $$3400 >>> 0) {
      _abort(); //@line 4564
     }
     HEAP32[$$3400 + 24 >> 2] = $165; //@line 4568
     $213 = $10 + 16 | 0; //@line 4569
     $214 = HEAP32[$213 >> 2] | 0; //@line 4570
     do {
      if ($214 | 0) {
       if ($210 >>> 0 > $214 >>> 0) {
        _abort(); //@line 4576
       } else {
        HEAP32[$$3400 + 16 >> 2] = $214; //@line 4580
        HEAP32[$214 + 24 >> 2] = $$3400; //@line 4582
        break;
       }
      }
     } while (0);
     $220 = HEAP32[$213 + 4 >> 2] | 0; //@line 4588
     if ($220 | 0) {
      if ((HEAP32[1009] | 0) >>> 0 > $220 >>> 0) {
       _abort(); //@line 4594
      } else {
       HEAP32[$$3400 + 20 >> 2] = $220; //@line 4598
       HEAP32[$220 + 24 >> 2] = $$3400; //@line 4600
       break;
      }
     }
    }
   }
  } while (0);
  HEAP32[$$1 + 4 >> 2] = $137 | 1; //@line 4609
  HEAP32[$114 + $137 >> 2] = $137; //@line 4611
  if (($$1 | 0) == (HEAP32[1010] | 0)) {
   HEAP32[1007] = $137; //@line 4615
   return;
  } else {
   $$2 = $137; //@line 4618
  }
 } else {
  HEAP32[$115 >> 2] = $116 & -2; //@line 4622
  HEAP32[$$1 + 4 >> 2] = $$1382 | 1; //@line 4625
  HEAP32[$114 + $$1382 >> 2] = $$1382; //@line 4627
  $$2 = $$1382; //@line 4628
 }
 $235 = $$2 >>> 3; //@line 4630
 if ($$2 >>> 0 < 256) {
  $238 = 4060 + ($235 << 1 << 2) | 0; //@line 4634
  $239 = HEAP32[1005] | 0; //@line 4635
  $240 = 1 << $235; //@line 4636
  if (!($239 & $240)) {
   HEAP32[1005] = $239 | $240; //@line 4641
   $$0403 = $238; //@line 4643
   $$pre$phiZ2D = $238 + 8 | 0; //@line 4643
  } else {
   $244 = $238 + 8 | 0; //@line 4645
   $245 = HEAP32[$244 >> 2] | 0; //@line 4646
   if ((HEAP32[1009] | 0) >>> 0 > $245 >>> 0) {
    _abort(); //@line 4650
   } else {
    $$0403 = $245; //@line 4653
    $$pre$phiZ2D = $244; //@line 4653
   }
  }
  HEAP32[$$pre$phiZ2D >> 2] = $$1; //@line 4656
  HEAP32[$$0403 + 12 >> 2] = $$1; //@line 4658
  HEAP32[$$1 + 8 >> 2] = $$0403; //@line 4660
  HEAP32[$$1 + 12 >> 2] = $238; //@line 4662
  return;
 }
 $251 = $$2 >>> 8; //@line 4665
 if (!$251) {
  $$0396 = 0; //@line 4668
 } else {
  if ($$2 >>> 0 > 16777215) {
   $$0396 = 31; //@line 4672
  } else {
   $256 = ($251 + 1048320 | 0) >>> 16 & 8; //@line 4676
   $257 = $251 << $256; //@line 4677
   $260 = ($257 + 520192 | 0) >>> 16 & 4; //@line 4680
   $262 = $257 << $260; //@line 4682
   $265 = ($262 + 245760 | 0) >>> 16 & 2; //@line 4685
   $270 = 14 - ($260 | $256 | $265) + ($262 << $265 >>> 15) | 0; //@line 4690
   $$0396 = $$2 >>> ($270 + 7 | 0) & 1 | $270 << 1; //@line 4696
  }
 }
 $276 = 4324 + ($$0396 << 2) | 0; //@line 4699
 HEAP32[$$1 + 28 >> 2] = $$0396; //@line 4701
 HEAP32[$$1 + 20 >> 2] = 0; //@line 4704
 HEAP32[$$1 + 16 >> 2] = 0; //@line 4705
 $280 = HEAP32[1006] | 0; //@line 4706
 $281 = 1 << $$0396; //@line 4707
 do {
  if (!($280 & $281)) {
   HEAP32[1006] = $280 | $281; //@line 4713
   HEAP32[$276 >> 2] = $$1; //@line 4714
   HEAP32[$$1 + 24 >> 2] = $276; //@line 4716
   HEAP32[$$1 + 12 >> 2] = $$1; //@line 4718
   HEAP32[$$1 + 8 >> 2] = $$1; //@line 4720
  } else {
   $$0383 = $$2 << (($$0396 | 0) == 31 ? 0 : 25 - ($$0396 >>> 1) | 0); //@line 4728
   $$0384 = HEAP32[$276 >> 2] | 0; //@line 4728
   while (1) {
    if ((HEAP32[$$0384 + 4 >> 2] & -8 | 0) == ($$2 | 0)) {
     label = 124; //@line 4735
     break;
    }
    $299 = $$0384 + 16 + ($$0383 >>> 31 << 2) | 0; //@line 4739
    $301 = HEAP32[$299 >> 2] | 0; //@line 4741
    if (!$301) {
     label = 121; //@line 4744
     break;
    } else {
     $$0383 = $$0383 << 1; //@line 4747
     $$0384 = $301; //@line 4747
    }
   }
   if ((label | 0) == 121) {
    if ((HEAP32[1009] | 0) >>> 0 > $299 >>> 0) {
     _abort(); //@line 4754
    } else {
     HEAP32[$299 >> 2] = $$1; //@line 4757
     HEAP32[$$1 + 24 >> 2] = $$0384; //@line 4759
     HEAP32[$$1 + 12 >> 2] = $$1; //@line 4761
     HEAP32[$$1 + 8 >> 2] = $$1; //@line 4763
     break;
    }
   } else if ((label | 0) == 124) {
    $308 = $$0384 + 8 | 0; //@line 4768
    $309 = HEAP32[$308 >> 2] | 0; //@line 4769
    $310 = HEAP32[1009] | 0; //@line 4770
    if ($310 >>> 0 <= $309 >>> 0 & $310 >>> 0 <= $$0384 >>> 0) {
     HEAP32[$309 + 12 >> 2] = $$1; //@line 4776
     HEAP32[$308 >> 2] = $$1; //@line 4777
     HEAP32[$$1 + 8 >> 2] = $309; //@line 4779
     HEAP32[$$1 + 12 >> 2] = $$0384; //@line 4781
     HEAP32[$$1 + 24 >> 2] = 0; //@line 4783
     break;
    } else {
     _abort(); //@line 4786
    }
   }
  }
 } while (0);
 $319 = (HEAP32[1013] | 0) + -1 | 0; //@line 4793
 HEAP32[1013] = $319; //@line 4794
 if (!$319) {
  $$0212$in$i = 4476; //@line 4797
 } else {
  return;
 }
 while (1) {
  $$0212$i = HEAP32[$$0212$in$i >> 2] | 0; //@line 4802
  if (!$$0212$i) {
   break;
  } else {
   $$0212$in$i = $$0212$i + 8 | 0; //@line 4808
  }
 }
 HEAP32[1013] = -1; //@line 4811
 return;
}
function _twoway_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0166 = 0, $$0168 = 0, $$0169 = 0, $$0169$be = 0, $$0170 = 0, $$0175$ph$ph$lcssa216 = 0, $$0175$ph$ph$lcssa216328 = 0, $$0175$ph$ph254 = 0, $$0179242 = 0, $$0183$ph197$ph253 = 0, $$0183$ph197248 = 0, $$0183$ph260 = 0, $$0185$ph$lcssa = 0, $$0185$ph$lcssa327 = 0, $$0185$ph259 = 0, $$0187219$ph325326 = 0, $$0187263 = 0, $$1176$$0175 = 0, $$1176$ph$ph$lcssa208 = 0, $$1176$ph$ph233 = 0, $$1180222 = 0, $$1184$ph193$ph232 = 0, $$1184$ph193227 = 0, $$1184$ph239 = 0, $$1186$$0185 = 0, $$1186$ph$lcssa = 0, $$1186$ph238 = 0, $$2181$sink = 0, $$3 = 0, $$3173 = 0, $$3178 = 0, $$3182221 = 0, $$4 = 0, $$pr = 0, $10 = 0, $105 = 0, $111 = 0, $113 = 0, $118 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $14 = 0, $2 = 0, $23 = 0, $25 = 0, $27 = 0, $3 = 0, $32 = 0, $34 = 0, $37 = 0, $4 = 0, $41 = 0, $45 = 0, $50 = 0, $52 = 0, $53 = 0, $56 = 0, $60 = 0, $68 = 0, $70 = 0, $74 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $83 = 0, $86 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 9151
 STACKTOP = STACKTOP + 1056 | 0; //@line 9152
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(1056); //@line 9152
 $2 = sp + 1024 | 0; //@line 9153
 $3 = sp; //@line 9154
 HEAP32[$2 >> 2] = 0; //@line 9155
 HEAP32[$2 + 4 >> 2] = 0; //@line 9155
 HEAP32[$2 + 8 >> 2] = 0; //@line 9155
 HEAP32[$2 + 12 >> 2] = 0; //@line 9155
 HEAP32[$2 + 16 >> 2] = 0; //@line 9155
 HEAP32[$2 + 20 >> 2] = 0; //@line 9155
 HEAP32[$2 + 24 >> 2] = 0; //@line 9155
 HEAP32[$2 + 28 >> 2] = 0; //@line 9155
 $4 = HEAP8[$1 >> 0] | 0; //@line 9156
 L1 : do {
  if (!($4 << 24 >> 24)) {
   $$0175$ph$ph$lcssa216328 = 1; //@line 9160
   $$0185$ph$lcssa327 = -1; //@line 9160
   $$0187219$ph325326 = 0; //@line 9160
   $$1176$ph$ph$lcssa208 = 1; //@line 9160
   $$1186$ph$lcssa = -1; //@line 9160
   label = 26; //@line 9161
  } else {
   $$0187263 = 0; //@line 9163
   $10 = $4; //@line 9163
   do {
    if (!(HEAP8[$0 + $$0187263 >> 0] | 0)) {
     $$3 = 0; //@line 9169
     break L1;
    }
    $14 = $2 + ((($10 & 255) >>> 5 & 255) << 2) | 0; //@line 9177
    HEAP32[$14 >> 2] = HEAP32[$14 >> 2] | 1 << ($10 & 31); //@line 9180
    $$0187263 = $$0187263 + 1 | 0; //@line 9181
    HEAP32[$3 + (($10 & 255) << 2) >> 2] = $$0187263; //@line 9184
    $10 = HEAP8[$1 + $$0187263 >> 0] | 0; //@line 9186
   } while ($10 << 24 >> 24 != 0);
   $23 = $$0187263 >>> 0 > 1; //@line 9194
   if ($23) {
    $$0183$ph260 = 0; //@line 9196
    $$0185$ph259 = -1; //@line 9196
    $130 = 1; //@line 9196
    L6 : while (1) {
     $$0175$ph$ph254 = 1; //@line 9198
     $$0183$ph197$ph253 = $$0183$ph260; //@line 9198
     $131 = $130; //@line 9198
     while (1) {
      $$0183$ph197248 = $$0183$ph197$ph253; //@line 9200
      $132 = $131; //@line 9200
      L10 : while (1) {
       $$0179242 = 1; //@line 9202
       $25 = $132; //@line 9202
       while (1) {
        $32 = HEAP8[$1 + ($$0179242 + $$0185$ph259) >> 0] | 0; //@line 9206
        $34 = HEAP8[$1 + $25 >> 0] | 0; //@line 9208
        if ($32 << 24 >> 24 != $34 << 24 >> 24) {
         break L10;
        }
        if (($$0179242 | 0) == ($$0175$ph$ph254 | 0)) {
         break;
        }
        $$0179242 = $$0179242 + 1 | 0; //@line 9214
        $27 = $$0179242 + $$0183$ph197248 | 0; //@line 9218
        if ($27 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9223
         $$0185$ph$lcssa = $$0185$ph259; //@line 9223
         break L6;
        } else {
         $25 = $27; //@line 9221
        }
       }
       $37 = $$0175$ph$ph254 + $$0183$ph197248 | 0; //@line 9227
       $132 = $37 + 1 | 0; //@line 9228
       if ($132 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216 = $$0175$ph$ph254; //@line 9233
        $$0185$ph$lcssa = $$0185$ph259; //@line 9233
        break L6;
       } else {
        $$0183$ph197248 = $37; //@line 9231
       }
      }
      $41 = $25 - $$0185$ph259 | 0; //@line 9238
      if (($32 & 255) <= ($34 & 255)) {
       break;
      }
      $131 = $25 + 1 | 0; //@line 9242
      if ($131 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216 = $41; //@line 9247
       $$0185$ph$lcssa = $$0185$ph259; //@line 9247
       break L6;
      } else {
       $$0175$ph$ph254 = $41; //@line 9245
       $$0183$ph197$ph253 = $25; //@line 9245
      }
     }
     $130 = $$0183$ph197248 + 2 | 0; //@line 9252
     if ($130 >>> 0 >= $$0187263 >>> 0) {
      $$0175$ph$ph$lcssa216 = 1; //@line 9257
      $$0185$ph$lcssa = $$0183$ph197248; //@line 9257
      break;
     } else {
      $$0183$ph260 = $$0183$ph197248 + 1 | 0; //@line 9255
      $$0185$ph259 = $$0183$ph197248; //@line 9255
     }
    }
    if ($23) {
     $$1184$ph239 = 0; //@line 9262
     $$1186$ph238 = -1; //@line 9262
     $133 = 1; //@line 9262
     while (1) {
      $$1176$ph$ph233 = 1; //@line 9264
      $$1184$ph193$ph232 = $$1184$ph239; //@line 9264
      $135 = $133; //@line 9264
      while (1) {
       $$1184$ph193227 = $$1184$ph193$ph232; //@line 9266
       $134 = $135; //@line 9266
       L25 : while (1) {
        $$1180222 = 1; //@line 9268
        $52 = $134; //@line 9268
        while (1) {
         $50 = HEAP8[$1 + ($$1180222 + $$1186$ph238) >> 0] | 0; //@line 9272
         $53 = HEAP8[$1 + $52 >> 0] | 0; //@line 9274
         if ($50 << 24 >> 24 != $53 << 24 >> 24) {
          break L25;
         }
         if (($$1180222 | 0) == ($$1176$ph$ph233 | 0)) {
          break;
         }
         $$1180222 = $$1180222 + 1 | 0; //@line 9280
         $45 = $$1180222 + $$1184$ph193227 | 0; //@line 9284
         if ($45 >>> 0 >= $$0187263 >>> 0) {
          $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9289
          $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9289
          $$0187219$ph325326 = $$0187263; //@line 9289
          $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 9289
          $$1186$ph$lcssa = $$1186$ph238; //@line 9289
          label = 26; //@line 9290
          break L1;
         } else {
          $52 = $45; //@line 9287
         }
        }
        $56 = $$1176$ph$ph233 + $$1184$ph193227 | 0; //@line 9294
        $134 = $56 + 1 | 0; //@line 9295
        if ($134 >>> 0 >= $$0187263 >>> 0) {
         $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9300
         $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9300
         $$0187219$ph325326 = $$0187263; //@line 9300
         $$1176$ph$ph$lcssa208 = $$1176$ph$ph233; //@line 9300
         $$1186$ph$lcssa = $$1186$ph238; //@line 9300
         label = 26; //@line 9301
         break L1;
        } else {
         $$1184$ph193227 = $56; //@line 9298
        }
       }
       $60 = $52 - $$1186$ph238 | 0; //@line 9306
       if (($50 & 255) >= ($53 & 255)) {
        break;
       }
       $135 = $52 + 1 | 0; //@line 9310
       if ($135 >>> 0 >= $$0187263 >>> 0) {
        $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9315
        $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9315
        $$0187219$ph325326 = $$0187263; //@line 9315
        $$1176$ph$ph$lcssa208 = $60; //@line 9315
        $$1186$ph$lcssa = $$1186$ph238; //@line 9315
        label = 26; //@line 9316
        break L1;
       } else {
        $$1176$ph$ph233 = $60; //@line 9313
        $$1184$ph193$ph232 = $52; //@line 9313
       }
      }
      $133 = $$1184$ph193227 + 2 | 0; //@line 9321
      if ($133 >>> 0 >= $$0187263 >>> 0) {
       $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9326
       $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9326
       $$0187219$ph325326 = $$0187263; //@line 9326
       $$1176$ph$ph$lcssa208 = 1; //@line 9326
       $$1186$ph$lcssa = $$1184$ph193227; //@line 9326
       label = 26; //@line 9327
       break;
      } else {
       $$1184$ph239 = $$1184$ph193227 + 1 | 0; //@line 9324
       $$1186$ph238 = $$1184$ph193227; //@line 9324
      }
     }
    } else {
     $$0175$ph$ph$lcssa216328 = $$0175$ph$ph$lcssa216; //@line 9332
     $$0185$ph$lcssa327 = $$0185$ph$lcssa; //@line 9332
     $$0187219$ph325326 = $$0187263; //@line 9332
     $$1176$ph$ph$lcssa208 = 1; //@line 9332
     $$1186$ph$lcssa = -1; //@line 9332
     label = 26; //@line 9333
    }
   } else {
    $$0175$ph$ph$lcssa216328 = 1; //@line 9336
    $$0185$ph$lcssa327 = -1; //@line 9336
    $$0187219$ph325326 = $$0187263; //@line 9336
    $$1176$ph$ph$lcssa208 = 1; //@line 9336
    $$1186$ph$lcssa = -1; //@line 9336
    label = 26; //@line 9337
   }
  }
 } while (0);
 L35 : do {
  if ((label | 0) == 26) {
   $68 = ($$1186$ph$lcssa + 1 | 0) >>> 0 > ($$0185$ph$lcssa327 + 1 | 0) >>> 0; //@line 9345
   $$1176$$0175 = $68 ? $$1176$ph$ph$lcssa208 : $$0175$ph$ph$lcssa216328; //@line 9346
   $$1186$$0185 = $68 ? $$1186$ph$lcssa : $$0185$ph$lcssa327; //@line 9347
   $70 = $$1186$$0185 + 1 | 0; //@line 9349
   if (!(_memcmp($1, $1 + $$1176$$0175 | 0, $70) | 0)) {
    $$0168 = $$0187219$ph325326 - $$1176$$0175 | 0; //@line 9354
    $$3178 = $$1176$$0175; //@line 9354
   } else {
    $74 = $$0187219$ph325326 - $$1186$$0185 + -1 | 0; //@line 9357
    $$0168 = 0; //@line 9361
    $$3178 = ($$1186$$0185 >>> 0 > $74 >>> 0 ? $$1186$$0185 : $74) + 1 | 0; //@line 9361
   }
   $78 = $$0187219$ph325326 | 63; //@line 9363
   $79 = $$0187219$ph325326 + -1 | 0; //@line 9364
   $80 = ($$0168 | 0) != 0; //@line 9365
   $81 = $$0187219$ph325326 - $$3178 | 0; //@line 9366
   $$0166 = $0; //@line 9367
   $$0169 = 0; //@line 9367
   $$0170 = $0; //@line 9367
   while (1) {
    $83 = $$0166; //@line 9370
    do {
     if (($$0170 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
      $86 = _memchr($$0170, 0, $78) | 0; //@line 9375
      if (!$86) {
       $$3173 = $$0170 + $78 | 0; //@line 9379
       break;
      } else {
       if (($86 - $83 | 0) >>> 0 < $$0187219$ph325326 >>> 0) {
        $$3 = 0; //@line 9386
        break L35;
       } else {
        $$3173 = $86; //@line 9389
        break;
       }
      }
     } else {
      $$3173 = $$0170; //@line 9394
     }
    } while (0);
    $93 = HEAP8[$$0166 + $79 >> 0] | 0; //@line 9398
    L49 : do {
     if (!(1 << ($93 & 31) & HEAP32[$2 + ((($93 & 255) >>> 5 & 255) << 2) >> 2])) {
      $$0169$be = 0; //@line 9410
      $$2181$sink = $$0187219$ph325326; //@line 9410
     } else {
      $105 = $$0187219$ph325326 - (HEAP32[$3 + (($93 & 255) << 2) >> 2] | 0) | 0; //@line 9415
      if ($105 | 0) {
       $$0169$be = 0; //@line 9423
       $$2181$sink = $80 & ($$0169 | 0) != 0 & $105 >>> 0 < $$3178 >>> 0 ? $81 : $105; //@line 9423
       break;
      }
      $111 = $70 >>> 0 > $$0169 >>> 0 ? $70 : $$0169; //@line 9427
      $113 = HEAP8[$1 + $111 >> 0] | 0; //@line 9429
      L54 : do {
       if (!($113 << 24 >> 24)) {
        $$4 = $70; //@line 9433
       } else {
        $$3182221 = $111; //@line 9435
        $$pr = $113; //@line 9435
        while (1) {
         if ($$pr << 24 >> 24 != (HEAP8[$$0166 + $$3182221 >> 0] | 0)) {
          break;
         }
         $118 = $$3182221 + 1 | 0; //@line 9443
         $$pr = HEAP8[$1 + $118 >> 0] | 0; //@line 9445
         if (!($$pr << 24 >> 24)) {
          $$4 = $70; //@line 9448
          break L54;
         } else {
          $$3182221 = $118; //@line 9451
         }
        }
        $$0169$be = 0; //@line 9455
        $$2181$sink = $$3182221 - $$1186$$0185 | 0; //@line 9455
        break L49;
       }
      } while (0);
      while (1) {
       if ($$4 >>> 0 <= $$0169 >>> 0) {
        $$3 = $$0166; //@line 9462
        break L35;
       }
       $$4 = $$4 + -1 | 0; //@line 9465
       if ((HEAP8[$1 + $$4 >> 0] | 0) != (HEAP8[$$0166 + $$4 >> 0] | 0)) {
        $$0169$be = $$0168; //@line 9474
        $$2181$sink = $$3178; //@line 9474
        break;
       }
      }
     }
    } while (0);
    $$0166 = $$0166 + $$2181$sink | 0; //@line 9481
    $$0169 = $$0169$be; //@line 9481
    $$0170 = $$3173; //@line 9481
   }
  }
 } while (0);
 STACKTOP = sp; //@line 9485
 return $$3 | 0; //@line 9485
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 $rem = $rem | 0;
 var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $_0$0 = 0, $_0$1 = 0, $q_sroa_1_1198$looptemp = 0;
 $n_sroa_0_0_extract_trunc = $a$0; //@line 13194
 $n_sroa_1_4_extract_shift$0 = $a$1; //@line 13195
 $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0; //@line 13196
 $d_sroa_0_0_extract_trunc = $b$0; //@line 13197
 $d_sroa_1_4_extract_shift$0 = $b$1; //@line 13198
 $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0; //@line 13199
 if (!$n_sroa_1_4_extract_trunc) {
  $4 = ($rem | 0) != 0; //@line 13201
  if (!$d_sroa_1_4_extract_trunc) {
   if ($4) {
    HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 13204
    HEAP32[$rem + 4 >> 2] = 0; //@line 13205
   }
   $_0$1 = 0; //@line 13207
   $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 13208
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13209
  } else {
   if (!$4) {
    $_0$1 = 0; //@line 13212
    $_0$0 = 0; //@line 13213
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13214
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 13216
   HEAP32[$rem + 4 >> 2] = $a$1 & 0; //@line 13217
   $_0$1 = 0; //@line 13218
   $_0$0 = 0; //@line 13219
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13220
  }
 }
 $17 = ($d_sroa_1_4_extract_trunc | 0) == 0; //@line 13223
 do {
  if (!$d_sroa_0_0_extract_trunc) {
   if ($17) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0); //@line 13228
     HEAP32[$rem + 4 >> 2] = 0; //@line 13229
    }
    $_0$1 = 0; //@line 13231
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0; //@line 13232
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13233
   }
   if (!$n_sroa_0_0_extract_trunc) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = 0; //@line 13237
     HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0); //@line 13238
    }
    $_0$1 = 0; //@line 13240
    $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0; //@line 13241
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13242
   }
   $37 = $d_sroa_1_4_extract_trunc - 1 | 0; //@line 13244
   if (!($37 & $d_sroa_1_4_extract_trunc)) {
    if ($rem | 0) {
     HEAP32[$rem >> 2] = $a$0 | 0; //@line 13247
     HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0; //@line 13248
    }
    $_0$1 = 0; //@line 13250
    $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0); //@line 13251
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13252
   }
   $51 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13255
   if ($51 >>> 0 <= 30) {
    $57 = $51 + 1 | 0; //@line 13257
    $58 = 31 - $51 | 0; //@line 13258
    $sr_1_ph = $57; //@line 13259
    $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0); //@line 13260
    $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0); //@line 13261
    $q_sroa_0_1_ph = 0; //@line 13262
    $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58; //@line 13263
    break;
   }
   if (!$rem) {
    $_0$1 = 0; //@line 13267
    $_0$0 = 0; //@line 13268
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13269
   }
   HEAP32[$rem >> 2] = $a$0 | 0; //@line 13271
   HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13272
   $_0$1 = 0; //@line 13273
   $_0$0 = 0; //@line 13274
   return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13275
  } else {
   if (!$17) {
    $119 = (Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0) - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13279
    if ($119 >>> 0 <= 31) {
     $125 = $119 + 1 | 0; //@line 13281
     $126 = 31 - $119 | 0; //@line 13282
     $130 = $119 - 31 >> 31; //@line 13283
     $sr_1_ph = $125; //@line 13284
     $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126; //@line 13285
     $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130; //@line 13286
     $q_sroa_0_1_ph = 0; //@line 13287
     $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126; //@line 13288
     break;
    }
    if (!$rem) {
     $_0$1 = 0; //@line 13292
     $_0$0 = 0; //@line 13293
     return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13294
    }
    HEAP32[$rem >> 2] = $a$0 | 0; //@line 13296
    HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13297
    $_0$1 = 0; //@line 13298
    $_0$0 = 0; //@line 13299
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13300
   }
   $66 = $d_sroa_0_0_extract_trunc - 1 | 0; //@line 13302
   if ($66 & $d_sroa_0_0_extract_trunc | 0) {
    $88 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0; //@line 13305
    $89 = 64 - $88 | 0; //@line 13306
    $91 = 32 - $88 | 0; //@line 13307
    $92 = $91 >> 31; //@line 13308
    $95 = $88 - 32 | 0; //@line 13309
    $105 = $95 >> 31; //@line 13310
    $sr_1_ph = $88; //@line 13311
    $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105; //@line 13312
    $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0); //@line 13313
    $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92; //@line 13314
    $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31; //@line 13315
    break;
   }
   if ($rem | 0) {
    HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc; //@line 13319
    HEAP32[$rem + 4 >> 2] = 0; //@line 13320
   }
   if (($d_sroa_0_0_extract_trunc | 0) == 1) {
    $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0; //@line 13323
    $_0$0 = $a$0 | 0 | 0; //@line 13324
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13325
   } else {
    $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0; //@line 13327
    $_0$1 = $n_sroa_1_4_extract_trunc >>> ($78 >>> 0) | 0; //@line 13328
    $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0; //@line 13329
    return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13330
   }
  }
 } while (0);
 if (!$sr_1_ph) {
  $q_sroa_1_1_lcssa = $q_sroa_1_1_ph; //@line 13335
  $q_sroa_0_1_lcssa = $q_sroa_0_1_ph; //@line 13336
  $r_sroa_1_1_lcssa = $r_sroa_1_1_ph; //@line 13337
  $r_sroa_0_1_lcssa = $r_sroa_0_1_ph; //@line 13338
  $carry_0_lcssa$1 = 0; //@line 13339
  $carry_0_lcssa$0 = 0; //@line 13340
 } else {
  $d_sroa_0_0_insert_insert99$0 = $b$0 | 0 | 0; //@line 13342
  $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0; //@line 13343
  $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0; //@line 13344
  $137$1 = tempRet0; //@line 13345
  $q_sroa_1_1198 = $q_sroa_1_1_ph; //@line 13346
  $q_sroa_0_1199 = $q_sroa_0_1_ph; //@line 13347
  $r_sroa_1_1200 = $r_sroa_1_1_ph; //@line 13348
  $r_sroa_0_1201 = $r_sroa_0_1_ph; //@line 13349
  $sr_1202 = $sr_1_ph; //@line 13350
  $carry_0203 = 0; //@line 13351
  do {
   $q_sroa_1_1198$looptemp = $q_sroa_1_1198;
   $q_sroa_1_1198 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1; //@line 13353
   $q_sroa_0_1199 = $carry_0203 | $q_sroa_0_1199 << 1; //@line 13354
   $r_sroa_0_0_insert_insert42$0 = $r_sroa_0_1201 << 1 | $q_sroa_1_1198$looptemp >>> 31 | 0; //@line 13355
   $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0; //@line 13356
   _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0; //@line 13357
   $150$1 = tempRet0; //@line 13358
   $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1; //@line 13359
   $carry_0203 = $151$0 & 1; //@line 13360
   $r_sroa_0_1201 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0; //@line 13362
   $r_sroa_1_1200 = tempRet0; //@line 13363
   $sr_1202 = $sr_1202 - 1 | 0; //@line 13364
  } while (($sr_1202 | 0) != 0);
  $q_sroa_1_1_lcssa = $q_sroa_1_1198; //@line 13376
  $q_sroa_0_1_lcssa = $q_sroa_0_1199; //@line 13377
  $r_sroa_1_1_lcssa = $r_sroa_1_1200; //@line 13378
  $r_sroa_0_1_lcssa = $r_sroa_0_1201; //@line 13379
  $carry_0_lcssa$1 = 0; //@line 13380
  $carry_0_lcssa$0 = $carry_0203; //@line 13381
 }
 $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa; //@line 13383
 $q_sroa_0_0_insert_ext75$1 = 0; //@line 13384
 if ($rem | 0) {
  HEAP32[$rem >> 2] = $r_sroa_0_1_lcssa; //@line 13387
  HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa; //@line 13388
 }
 $_0$1 = ($q_sroa_0_0_insert_ext75$0 | 0) >>> 31 | ($q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1) << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1; //@line 13390
 $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0; //@line 13391
 return (tempRet0 = $_0$1, $_0$0) | 0; //@line 13392
}
function _mbed_die() {
 var $0 = 0, $AsyncCtx = 0, $AsyncCtx11 = 0, $AsyncCtx15 = 0, $AsyncCtx19 = 0, $AsyncCtx23 = 0, $AsyncCtx27 = 0, $AsyncCtx3 = 0, $AsyncCtx31 = 0, $AsyncCtx35 = 0, $AsyncCtx39 = 0, $AsyncCtx43 = 0, $AsyncCtx47 = 0, $AsyncCtx51 = 0, $AsyncCtx55 = 0, $AsyncCtx59 = 0, $AsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 1069
 STACKTOP = STACKTOP + 32 | 0; //@line 1070
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 1070
 $0 = sp; //@line 1071
 _gpio_init_out($0, 50); //@line 1072
 while (1) {
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1075
  $AsyncCtx59 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1076
  _wait_ms(150); //@line 1077
  if (___async) {
   label = 3; //@line 1080
   break;
  }
  _emscripten_free_async_context($AsyncCtx59 | 0); //@line 1083
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1085
  $AsyncCtx55 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1086
  _wait_ms(150); //@line 1087
  if (___async) {
   label = 5; //@line 1090
   break;
  }
  _emscripten_free_async_context($AsyncCtx55 | 0); //@line 1093
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1095
  $AsyncCtx51 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1096
  _wait_ms(150); //@line 1097
  if (___async) {
   label = 7; //@line 1100
   break;
  }
  _emscripten_free_async_context($AsyncCtx51 | 0); //@line 1103
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1105
  $AsyncCtx47 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1106
  _wait_ms(150); //@line 1107
  if (___async) {
   label = 9; //@line 1110
   break;
  }
  _emscripten_free_async_context($AsyncCtx47 | 0); //@line 1113
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1115
  $AsyncCtx43 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1116
  _wait_ms(150); //@line 1117
  if (___async) {
   label = 11; //@line 1120
   break;
  }
  _emscripten_free_async_context($AsyncCtx43 | 0); //@line 1123
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1125
  $AsyncCtx39 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1126
  _wait_ms(150); //@line 1127
  if (___async) {
   label = 13; //@line 1130
   break;
  }
  _emscripten_free_async_context($AsyncCtx39 | 0); //@line 1133
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1135
  $AsyncCtx35 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1136
  _wait_ms(150); //@line 1137
  if (___async) {
   label = 15; //@line 1140
   break;
  }
  _emscripten_free_async_context($AsyncCtx35 | 0); //@line 1143
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1145
  $AsyncCtx31 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1146
  _wait_ms(150); //@line 1147
  if (___async) {
   label = 17; //@line 1150
   break;
  }
  _emscripten_free_async_context($AsyncCtx31 | 0); //@line 1153
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1155
  $AsyncCtx27 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1156
  _wait_ms(400); //@line 1157
  if (___async) {
   label = 19; //@line 1160
   break;
  }
  _emscripten_free_async_context($AsyncCtx27 | 0); //@line 1163
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1165
  $AsyncCtx23 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1166
  _wait_ms(400); //@line 1167
  if (___async) {
   label = 21; //@line 1170
   break;
  }
  _emscripten_free_async_context($AsyncCtx23 | 0); //@line 1173
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1175
  $AsyncCtx19 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1176
  _wait_ms(400); //@line 1177
  if (___async) {
   label = 23; //@line 1180
   break;
  }
  _emscripten_free_async_context($AsyncCtx19 | 0); //@line 1183
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1185
  $AsyncCtx15 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1186
  _wait_ms(400); //@line 1187
  if (___async) {
   label = 25; //@line 1190
   break;
  }
  _emscripten_free_async_context($AsyncCtx15 | 0); //@line 1193
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1195
  $AsyncCtx11 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1196
  _wait_ms(400); //@line 1197
  if (___async) {
   label = 27; //@line 1200
   break;
  }
  _emscripten_free_async_context($AsyncCtx11 | 0); //@line 1203
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1205
  $AsyncCtx7 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1206
  _wait_ms(400); //@line 1207
  if (___async) {
   label = 29; //@line 1210
   break;
  }
  _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1213
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 1) | 0; //@line 1215
  $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1216
  _wait_ms(400); //@line 1217
  if (___async) {
   label = 31; //@line 1220
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1223
  _emscripten_asm_const_iii(1, HEAP32[$0 >> 2] | 0, 0) | 0; //@line 1225
  $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1226
  _wait_ms(400); //@line 1227
  if (___async) {
   label = 33; //@line 1230
   break;
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1233
 }
 switch (label | 0) {
 case 3:
  {
   HEAP32[$AsyncCtx59 >> 2] = 23; //@line 1237
   HEAP32[$AsyncCtx59 + 4 >> 2] = $0; //@line 1239
   sp = STACKTOP; //@line 1240
   STACKTOP = sp; //@line 1241
   return;
  }
 case 5:
  {
   HEAP32[$AsyncCtx55 >> 2] = 24; //@line 1245
   HEAP32[$AsyncCtx55 + 4 >> 2] = $0; //@line 1247
   sp = STACKTOP; //@line 1248
   STACKTOP = sp; //@line 1249
   return;
  }
 case 7:
  {
   HEAP32[$AsyncCtx51 >> 2] = 25; //@line 1253
   HEAP32[$AsyncCtx51 + 4 >> 2] = $0; //@line 1255
   sp = STACKTOP; //@line 1256
   STACKTOP = sp; //@line 1257
   return;
  }
 case 9:
  {
   HEAP32[$AsyncCtx47 >> 2] = 26; //@line 1261
   HEAP32[$AsyncCtx47 + 4 >> 2] = $0; //@line 1263
   sp = STACKTOP; //@line 1264
   STACKTOP = sp; //@line 1265
   return;
  }
 case 11:
  {
   HEAP32[$AsyncCtx43 >> 2] = 27; //@line 1269
   HEAP32[$AsyncCtx43 + 4 >> 2] = $0; //@line 1271
   sp = STACKTOP; //@line 1272
   STACKTOP = sp; //@line 1273
   return;
  }
 case 13:
  {
   HEAP32[$AsyncCtx39 >> 2] = 28; //@line 1277
   HEAP32[$AsyncCtx39 + 4 >> 2] = $0; //@line 1279
   sp = STACKTOP; //@line 1280
   STACKTOP = sp; //@line 1281
   return;
  }
 case 15:
  {
   HEAP32[$AsyncCtx35 >> 2] = 29; //@line 1285
   HEAP32[$AsyncCtx35 + 4 >> 2] = $0; //@line 1287
   sp = STACKTOP; //@line 1288
   STACKTOP = sp; //@line 1289
   return;
  }
 case 17:
  {
   HEAP32[$AsyncCtx31 >> 2] = 30; //@line 1293
   HEAP32[$AsyncCtx31 + 4 >> 2] = $0; //@line 1295
   sp = STACKTOP; //@line 1296
   STACKTOP = sp; //@line 1297
   return;
  }
 case 19:
  {
   HEAP32[$AsyncCtx27 >> 2] = 31; //@line 1301
   HEAP32[$AsyncCtx27 + 4 >> 2] = $0; //@line 1303
   sp = STACKTOP; //@line 1304
   STACKTOP = sp; //@line 1305
   return;
  }
 case 21:
  {
   HEAP32[$AsyncCtx23 >> 2] = 32; //@line 1309
   HEAP32[$AsyncCtx23 + 4 >> 2] = $0; //@line 1311
   sp = STACKTOP; //@line 1312
   STACKTOP = sp; //@line 1313
   return;
  }
 case 23:
  {
   HEAP32[$AsyncCtx19 >> 2] = 33; //@line 1317
   HEAP32[$AsyncCtx19 + 4 >> 2] = $0; //@line 1319
   sp = STACKTOP; //@line 1320
   STACKTOP = sp; //@line 1321
   return;
  }
 case 25:
  {
   HEAP32[$AsyncCtx15 >> 2] = 34; //@line 1325
   HEAP32[$AsyncCtx15 + 4 >> 2] = $0; //@line 1327
   sp = STACKTOP; //@line 1328
   STACKTOP = sp; //@line 1329
   return;
  }
 case 27:
  {
   HEAP32[$AsyncCtx11 >> 2] = 35; //@line 1333
   HEAP32[$AsyncCtx11 + 4 >> 2] = $0; //@line 1335
   sp = STACKTOP; //@line 1336
   STACKTOP = sp; //@line 1337
   return;
  }
 case 29:
  {
   HEAP32[$AsyncCtx7 >> 2] = 36; //@line 1341
   HEAP32[$AsyncCtx7 + 4 >> 2] = $0; //@line 1343
   sp = STACKTOP; //@line 1344
   STACKTOP = sp; //@line 1345
   return;
  }
 case 31:
  {
   HEAP32[$AsyncCtx3 >> 2] = 37; //@line 1349
   HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 1351
   sp = STACKTOP; //@line 1352
   STACKTOP = sp; //@line 1353
   return;
  }
 case 33:
  {
   HEAP32[$AsyncCtx >> 2] = 38; //@line 1357
   HEAP32[$AsyncCtx + 4 >> 2] = $0; //@line 1359
   sp = STACKTOP; //@line 1360
   STACKTOP = sp; //@line 1361
   return;
  }
 }
}
function _mbed_vtracef__async_cb_27($0) {
 $0 = $0 | 0;
 var $$10 = 0, $$3147168 = 0, $$3169 = 0, $$5156 = 0, $$5156$ = 0, $$expand_i1_val = 0, $12 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $30 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $53 = 0, $54 = 0, $56 = 0, $67 = 0, $68 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $79 = 0, $8 = 0, $80 = 0, $ReallocAsyncCtx10 = 0, $ReallocAsyncCtx7 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12280
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12282
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12284
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12288
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12292
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12296
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12298
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12300
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12302
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12304
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12306
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 12310
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 12314
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 12316
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 12318
 $44 = HEAP8[$0 + 88 >> 0] & 1; //@line 12325
 $46 = HEAP32[$0 + 92 >> 2] | 0; //@line 12327
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 12329
 HEAP32[$38 >> 2] = HEAP32[___async_retval >> 2]; //@line 12332
 $50 = _snprintf($16, $18, 984, $38) | 0; //@line 12333
 $$10 = ($50 | 0) >= ($18 | 0) ? 0 : $50; //@line 12335
 $53 = $16 + $$10 | 0; //@line 12337
 $54 = $18 - $$10 | 0; //@line 12338
 if (($$10 | 0) > 0) {
  if (($54 | 0) > 0) {
   $$3147168 = $54; //@line 12342
   $$3169 = $53; //@line 12342
   label = 4; //@line 12343
  }
 } else {
  $$3147168 = $18; //@line 12346
  $$3169 = $16; //@line 12346
  label = 4; //@line 12347
 }
 if ((label | 0) == 4) {
  $56 = $20 + -2 | 0; //@line 12350
  switch ($56 >>> 1 | $56 << 31 | 0) {
  case 0:
   {
    HEAP32[$12 >> 2] = $4; //@line 12356
    $$5156 = _snprintf($$3169, $$3147168, 987, $12) | 0; //@line 12358
    break;
   }
  case 1:
   {
    HEAP32[$8 >> 2] = $4; //@line 12362
    $$5156 = _snprintf($$3169, $$3147168, 1002, $8) | 0; //@line 12364
    break;
   }
  case 3:
   {
    HEAP32[$2 >> 2] = $4; //@line 12368
    $$5156 = _snprintf($$3169, $$3147168, 1017, $2) | 0; //@line 12370
    break;
   }
  case 7:
   {
    HEAP32[$30 >> 2] = $4; //@line 12374
    $$5156 = _snprintf($$3169, $$3147168, 1032, $30) | 0; //@line 12376
    break;
   }
  default:
   {
    $$5156 = _snprintf($$3169, $$3147168, 1047, $26) | 0; //@line 12381
   }
  }
  $$5156$ = ($$5156 | 0) < ($$3147168 | 0) ? $$5156 : 0; //@line 12385
  $67 = $$3169 + $$5156$ | 0; //@line 12387
  $68 = $$3147168 - $$5156$ | 0; //@line 12388
  if (($$5156$ | 0) > 0 & ($68 | 0) > 0) {
   $ReallocAsyncCtx10 = _emscripten_realloc_async_context(32) | 0; //@line 12392
   $70 = _vsnprintf($67, $68, $22, $24) | 0; //@line 12393
   if (___async) {
    HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 12396
    $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 12397
    HEAP32[$71 >> 2] = $68; //@line 12398
    $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 12399
    HEAP32[$72 >> 2] = $67; //@line 12400
    $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 12401
    HEAP32[$73 >> 2] = $34; //@line 12402
    $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 12403
    HEAP32[$74 >> 2] = $36; //@line 12404
    $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 12405
    $$expand_i1_val = $44 & 1; //@line 12406
    HEAP8[$75 >> 0] = $$expand_i1_val; //@line 12407
    $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 12408
    HEAP32[$76 >> 2] = $46; //@line 12409
    $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 12410
    HEAP32[$77 >> 2] = $48; //@line 12411
    sp = STACKTOP; //@line 12412
    return;
   }
   HEAP32[___async_retval >> 2] = $70; //@line 12416
   ___async_unwind = 0; //@line 12417
   HEAP32[$ReallocAsyncCtx10 >> 2] = 16; //@line 12418
   $71 = $ReallocAsyncCtx10 + 4 | 0; //@line 12419
   HEAP32[$71 >> 2] = $68; //@line 12420
   $72 = $ReallocAsyncCtx10 + 8 | 0; //@line 12421
   HEAP32[$72 >> 2] = $67; //@line 12422
   $73 = $ReallocAsyncCtx10 + 12 | 0; //@line 12423
   HEAP32[$73 >> 2] = $34; //@line 12424
   $74 = $ReallocAsyncCtx10 + 16 | 0; //@line 12425
   HEAP32[$74 >> 2] = $36; //@line 12426
   $75 = $ReallocAsyncCtx10 + 20 | 0; //@line 12427
   $$expand_i1_val = $44 & 1; //@line 12428
   HEAP8[$75 >> 0] = $$expand_i1_val; //@line 12429
   $76 = $ReallocAsyncCtx10 + 24 | 0; //@line 12430
   HEAP32[$76 >> 2] = $46; //@line 12431
   $77 = $ReallocAsyncCtx10 + 28 | 0; //@line 12432
   HEAP32[$77 >> 2] = $48; //@line 12433
   sp = STACKTOP; //@line 12434
   return;
  }
 }
 $79 = HEAP32[35] | 0; //@line 12438
 $80 = HEAP32[28] | 0; //@line 12439
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12440
 FUNCTION_TABLE_vi[$79 & 127]($80); //@line 12441
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12444
  sp = STACKTOP; //@line 12445
  return;
 }
 ___async_unwind = 0; //@line 12448
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12449
 sp = STACKTOP; //@line 12450
 return;
}
function _pop_arg_673($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $108 = 0, $109 = 0.0, $115 = 0, $116 = 0.0, $16 = 0, $17 = 0, $20 = 0, $29 = 0, $30 = 0, $31 = 0, $40 = 0, $41 = 0, $43 = 0, $46 = 0, $47 = 0, $56 = 0, $57 = 0, $59 = 0, $62 = 0, $71 = 0, $72 = 0, $73 = 0, $82 = 0, $83 = 0, $85 = 0, $88 = 0, $9 = 0, $97 = 0, $98 = 0, $99 = 0;
 L1 : do {
  if ($1 >>> 0 <= 20) {
   do {
    switch ($1 | 0) {
    case 9:
     {
      $9 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7252
      $10 = HEAP32[$9 >> 2] | 0; //@line 7253
      HEAP32[$2 >> 2] = $9 + 4; //@line 7255
      HEAP32[$0 >> 2] = $10; //@line 7256
      break L1;
      break;
     }
    case 10:
     {
      $16 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7272
      $17 = HEAP32[$16 >> 2] | 0; //@line 7273
      HEAP32[$2 >> 2] = $16 + 4; //@line 7275
      $20 = $0; //@line 7278
      HEAP32[$20 >> 2] = $17; //@line 7280
      HEAP32[$20 + 4 >> 2] = (($17 | 0) < 0) << 31 >> 31; //@line 7283
      break L1;
      break;
     }
    case 11:
     {
      $29 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7299
      $30 = HEAP32[$29 >> 2] | 0; //@line 7300
      HEAP32[$2 >> 2] = $29 + 4; //@line 7302
      $31 = $0; //@line 7303
      HEAP32[$31 >> 2] = $30; //@line 7305
      HEAP32[$31 + 4 >> 2] = 0; //@line 7308
      break L1;
      break;
     }
    case 12:
     {
      $40 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7324
      $41 = $40; //@line 7325
      $43 = HEAP32[$41 >> 2] | 0; //@line 7327
      $46 = HEAP32[$41 + 4 >> 2] | 0; //@line 7330
      HEAP32[$2 >> 2] = $40 + 8; //@line 7332
      $47 = $0; //@line 7333
      HEAP32[$47 >> 2] = $43; //@line 7335
      HEAP32[$47 + 4 >> 2] = $46; //@line 7338
      break L1;
      break;
     }
    case 13:
     {
      $56 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7354
      $57 = HEAP32[$56 >> 2] | 0; //@line 7355
      HEAP32[$2 >> 2] = $56 + 4; //@line 7357
      $59 = ($57 & 65535) << 16 >> 16; //@line 7359
      $62 = $0; //@line 7362
      HEAP32[$62 >> 2] = $59; //@line 7364
      HEAP32[$62 + 4 >> 2] = (($59 | 0) < 0) << 31 >> 31; //@line 7367
      break L1;
      break;
     }
    case 14:
     {
      $71 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7383
      $72 = HEAP32[$71 >> 2] | 0; //@line 7384
      HEAP32[$2 >> 2] = $71 + 4; //@line 7386
      $73 = $0; //@line 7388
      HEAP32[$73 >> 2] = $72 & 65535; //@line 7390
      HEAP32[$73 + 4 >> 2] = 0; //@line 7393
      break L1;
      break;
     }
    case 15:
     {
      $82 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7409
      $83 = HEAP32[$82 >> 2] | 0; //@line 7410
      HEAP32[$2 >> 2] = $82 + 4; //@line 7412
      $85 = ($83 & 255) << 24 >> 24; //@line 7414
      $88 = $0; //@line 7417
      HEAP32[$88 >> 2] = $85; //@line 7419
      HEAP32[$88 + 4 >> 2] = (($85 | 0) < 0) << 31 >> 31; //@line 7422
      break L1;
      break;
     }
    case 16:
     {
      $97 = (HEAP32[$2 >> 2] | 0) + (4 - 1) & ~(4 - 1); //@line 7438
      $98 = HEAP32[$97 >> 2] | 0; //@line 7439
      HEAP32[$2 >> 2] = $97 + 4; //@line 7441
      $99 = $0; //@line 7443
      HEAP32[$99 >> 2] = $98 & 255; //@line 7445
      HEAP32[$99 + 4 >> 2] = 0; //@line 7448
      break L1;
      break;
     }
    case 17:
     {
      $108 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7464
      $109 = +HEAPF64[$108 >> 3]; //@line 7465
      HEAP32[$2 >> 2] = $108 + 8; //@line 7467
      HEAPF64[$0 >> 3] = $109; //@line 7468
      break L1;
      break;
     }
    case 18:
     {
      $115 = (HEAP32[$2 >> 2] | 0) + (8 - 1) & ~(8 - 1); //@line 7484
      $116 = +HEAPF64[$115 >> 3]; //@line 7485
      HEAP32[$2 >> 2] = $115 + 8; //@line 7487
      HEAPF64[$0 >> 3] = $116; //@line 7488
      break L1;
      break;
     }
    default:
     {
      break L1;
     }
    }
   } while (0);
  }
 } while (0);
 return;
}
function _vfprintf($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $$0 = 0, $$1 = 0, $13 = 0, $14 = 0, $19 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $28 = 0, $29 = 0, $3 = 0, $32 = 0, $4 = 0, $43 = 0, $5 = 0, $51 = 0, $6 = 0, $AsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 6152
 STACKTOP = STACKTOP + 224 | 0; //@line 6153
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(224); //@line 6153
 $3 = sp + 120 | 0; //@line 6154
 $4 = sp + 80 | 0; //@line 6155
 $5 = sp; //@line 6156
 $6 = sp + 136 | 0; //@line 6157
 dest = $4; //@line 6158
 stop = dest + 40 | 0; //@line 6158
 do {
  HEAP32[dest >> 2] = 0; //@line 6158
  dest = dest + 4 | 0; //@line 6158
 } while ((dest | 0) < (stop | 0));
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 6160
 if ((_printf_core(0, $1, $3, $5, $4) | 0) < 0) {
  $$0 = -1; //@line 6164
 } else {
  if ((HEAP32[$0 + 76 >> 2] | 0) > -1) {
   $43 = ___lockfile($0) | 0; //@line 6171
  } else {
   $43 = 0; //@line 6173
  }
  $13 = HEAP32[$0 >> 2] | 0; //@line 6175
  $14 = $13 & 32; //@line 6176
  if ((HEAP8[$0 + 74 >> 0] | 0) < 1) {
   HEAP32[$0 >> 2] = $13 & -33; //@line 6182
  }
  $19 = $0 + 48 | 0; //@line 6184
  do {
   if (!(HEAP32[$19 >> 2] | 0)) {
    $23 = $0 + 44 | 0; //@line 6189
    $24 = HEAP32[$23 >> 2] | 0; //@line 6190
    HEAP32[$23 >> 2] = $6; //@line 6191
    $25 = $0 + 28 | 0; //@line 6192
    HEAP32[$25 >> 2] = $6; //@line 6193
    $26 = $0 + 20 | 0; //@line 6194
    HEAP32[$26 >> 2] = $6; //@line 6195
    HEAP32[$19 >> 2] = 80; //@line 6196
    $28 = $0 + 16 | 0; //@line 6198
    HEAP32[$28 >> 2] = $6 + 80; //@line 6199
    $29 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6200
    if (!$24) {
     $$1 = $29; //@line 6203
    } else {
     $32 = HEAP32[$0 + 36 >> 2] | 0; //@line 6206
     $AsyncCtx = _emscripten_alloc_async_context(64, sp) | 0; //@line 6207
     FUNCTION_TABLE_iiii[$32 & 7]($0, 0, 0) | 0; //@line 6208
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 58; //@line 6211
      HEAP32[$AsyncCtx + 4 >> 2] = $26; //@line 6213
      HEAP32[$AsyncCtx + 8 >> 2] = $29; //@line 6215
      HEAP32[$AsyncCtx + 12 >> 2] = $24; //@line 6217
      HEAP32[$AsyncCtx + 16 >> 2] = $23; //@line 6219
      HEAP32[$AsyncCtx + 20 >> 2] = $19; //@line 6221
      HEAP32[$AsyncCtx + 24 >> 2] = $28; //@line 6223
      HEAP32[$AsyncCtx + 28 >> 2] = $25; //@line 6225
      HEAP32[$AsyncCtx + 32 >> 2] = $0; //@line 6227
      HEAP32[$AsyncCtx + 36 >> 2] = $14; //@line 6229
      HEAP32[$AsyncCtx + 40 >> 2] = $43; //@line 6231
      HEAP32[$AsyncCtx + 44 >> 2] = $0; //@line 6233
      HEAP32[$AsyncCtx + 48 >> 2] = $6; //@line 6235
      HEAP32[$AsyncCtx + 52 >> 2] = $5; //@line 6237
      HEAP32[$AsyncCtx + 56 >> 2] = $4; //@line 6239
      HEAP32[$AsyncCtx + 60 >> 2] = $3; //@line 6241
      sp = STACKTOP; //@line 6242
      STACKTOP = sp; //@line 6243
      return 0; //@line 6243
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 6245
      $$ = (HEAP32[$26 >> 2] | 0) == 0 ? -1 : $29; //@line 6248
      HEAP32[$23 >> 2] = $24; //@line 6249
      HEAP32[$19 >> 2] = 0; //@line 6250
      HEAP32[$28 >> 2] = 0; //@line 6251
      HEAP32[$25 >> 2] = 0; //@line 6252
      HEAP32[$26 >> 2] = 0; //@line 6253
      $$1 = $$; //@line 6254
      break;
     }
    }
   } else {
    $$1 = _printf_core($0, $1, $3, $5, $4) | 0; //@line 6260
   }
  } while (0);
  $51 = HEAP32[$0 >> 2] | 0; //@line 6263
  HEAP32[$0 >> 2] = $51 | $14; //@line 6268
  if ($43 | 0) {
   ___unlockfile($0); //@line 6271
  }
  $$0 = ($51 & 32 | 0) == 0 ? $$1 : -1; //@line 6273
 }
 STACKTOP = sp; //@line 6275
 return $$0 | 0; //@line 6275
}
function ___dynamic_cast($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$0 = 0, $10 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $24 = 0, $30 = 0, $33 = 0, $4 = 0, $5 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 10067
 STACKTOP = STACKTOP + 64 | 0; //@line 10068
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 10068
 $4 = sp; //@line 10069
 $5 = HEAP32[$0 >> 2] | 0; //@line 10070
 $8 = $0 + (HEAP32[$5 + -8 >> 2] | 0) | 0; //@line 10073
 $10 = HEAP32[$5 + -4 >> 2] | 0; //@line 10075
 HEAP32[$4 >> 2] = $2; //@line 10076
 HEAP32[$4 + 4 >> 2] = $0; //@line 10078
 HEAP32[$4 + 8 >> 2] = $1; //@line 10080
 HEAP32[$4 + 12 >> 2] = $3; //@line 10082
 $14 = $4 + 16 | 0; //@line 10083
 $15 = $4 + 20 | 0; //@line 10084
 $16 = $4 + 24 | 0; //@line 10085
 $17 = $4 + 28 | 0; //@line 10086
 $18 = $4 + 32 | 0; //@line 10087
 $19 = $4 + 40 | 0; //@line 10088
 dest = $14; //@line 10089
 stop = dest + 36 | 0; //@line 10089
 do {
  HEAP32[dest >> 2] = 0; //@line 10089
  dest = dest + 4 | 0; //@line 10089
 } while ((dest | 0) < (stop | 0));
 HEAP16[$14 + 36 >> 1] = 0; //@line 10089
 HEAP8[$14 + 38 >> 0] = 0; //@line 10089
 L1 : do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10, $2, 0) | 0) {
   HEAP32[$4 + 48 >> 2] = 1; //@line 10094
   $24 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10097
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10098
   FUNCTION_TABLE_viiiiii[$24 & 3]($10, $4, $8, $8, 1, 0); //@line 10099
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 64; //@line 10102
    HEAP32[$AsyncCtx + 4 >> 2] = $16; //@line 10104
    HEAP32[$AsyncCtx + 8 >> 2] = $8; //@line 10106
    HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 10108
    sp = STACKTOP; //@line 10109
    STACKTOP = sp; //@line 10110
    return 0; //@line 10110
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10112
    $$0 = (HEAP32[$16 >> 2] | 0) == 1 ? $8 : 0; //@line 10116
    break;
   }
  } else {
   $30 = $4 + 36 | 0; //@line 10120
   $33 = HEAP32[(HEAP32[$10 >> 2] | 0) + 24 >> 2] | 0; //@line 10123
   $AsyncCtx3 = _emscripten_alloc_async_context(36, sp) | 0; //@line 10124
   FUNCTION_TABLE_viiiii[$33 & 3]($10, $4, $8, 1, 0); //@line 10125
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 65; //@line 10128
    HEAP32[$AsyncCtx3 + 4 >> 2] = $30; //@line 10130
    HEAP32[$AsyncCtx3 + 8 >> 2] = $4; //@line 10132
    HEAP32[$AsyncCtx3 + 12 >> 2] = $19; //@line 10134
    HEAP32[$AsyncCtx3 + 16 >> 2] = $17; //@line 10136
    HEAP32[$AsyncCtx3 + 20 >> 2] = $18; //@line 10138
    HEAP32[$AsyncCtx3 + 24 >> 2] = $15; //@line 10140
    HEAP32[$AsyncCtx3 + 28 >> 2] = $16; //@line 10142
    HEAP32[$AsyncCtx3 + 32 >> 2] = $14; //@line 10144
    sp = STACKTOP; //@line 10145
    STACKTOP = sp; //@line 10146
    return 0; //@line 10146
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10148
   switch (HEAP32[$30 >> 2] | 0) {
   case 0:
    {
     $$0 = (HEAP32[$19 >> 2] | 0) == 1 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1 ? HEAP32[$15 >> 2] | 0 : 0; //@line 10162
     break L1;
     break;
    }
   case 1:
    {
     break;
    }
   default:
    {
     $$0 = 0; //@line 10170
     break L1;
    }
   }
   if ((HEAP32[$16 >> 2] | 0) != 1) {
    if (!((HEAP32[$19 >> 2] | 0) == 0 & (HEAP32[$17 >> 2] | 0) == 1 & (HEAP32[$18 >> 2] | 0) == 1)) {
     $$0 = 0; //@line 10186
     break;
    }
   }
   $$0 = HEAP32[$14 >> 2] | 0; //@line 10191
  }
 } while (0);
 STACKTOP = sp; //@line 10194
 return $$0 | 0; //@line 10194
}
function _memchr($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $11 = 0, $12 = 0, $16 = 0, $18 = 0, $20 = 0, $23 = 0, $29 = 0, $3 = 0, $30 = 0, $35 = 0, $7 = 0, $8 = 0, label = 0;
 $3 = $1 & 255; //@line 6024
 $7 = ($2 | 0) != 0; //@line 6028
 L1 : do {
  if ($7 & ($0 & 3 | 0) != 0) {
   $8 = $1 & 255; //@line 6032
   $$03555 = $0; //@line 6033
   $$03654 = $2; //@line 6033
   while (1) {
    if ((HEAP8[$$03555 >> 0] | 0) == $8 << 24 >> 24) {
     $$035$lcssa65 = $$03555; //@line 6038
     $$036$lcssa64 = $$03654; //@line 6038
     label = 6; //@line 6039
     break L1;
    }
    $11 = $$03555 + 1 | 0; //@line 6042
    $12 = $$03654 + -1 | 0; //@line 6043
    $16 = ($12 | 0) != 0; //@line 6047
    if ($16 & ($11 & 3 | 0) != 0) {
     $$03555 = $11; //@line 6050
     $$03654 = $12; //@line 6050
    } else {
     $$035$lcssa = $11; //@line 6052
     $$036$lcssa = $12; //@line 6052
     $$lcssa = $16; //@line 6052
     label = 5; //@line 6053
     break;
    }
   }
  } else {
   $$035$lcssa = $0; //@line 6058
   $$036$lcssa = $2; //@line 6058
   $$lcssa = $7; //@line 6058
   label = 5; //@line 6059
  }
 } while (0);
 if ((label | 0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa; //@line 6064
   $$036$lcssa64 = $$036$lcssa; //@line 6064
   label = 6; //@line 6065
  } else {
   $$2 = $$035$lcssa; //@line 6067
   $$3 = 0; //@line 6067
  }
 }
 L8 : do {
  if ((label | 0) == 6) {
   $18 = $1 & 255; //@line 6073
   if ((HEAP8[$$035$lcssa65 >> 0] | 0) == $18 << 24 >> 24) {
    $$2 = $$035$lcssa65; //@line 6076
    $$3 = $$036$lcssa64; //@line 6076
   } else {
    $20 = Math_imul($3, 16843009) | 0; //@line 6078
    L11 : do {
     if ($$036$lcssa64 >>> 0 > 3) {
      $$046 = $$035$lcssa65; //@line 6082
      $$13745 = $$036$lcssa64; //@line 6082
      while (1) {
       $23 = HEAP32[$$046 >> 2] ^ $20; //@line 6085
       if (($23 & -2139062144 ^ -2139062144) & $23 + -16843009 | 0) {
        break;
       }
       $29 = $$046 + 4 | 0; //@line 6094
       $30 = $$13745 + -4 | 0; //@line 6095
       if ($30 >>> 0 > 3) {
        $$046 = $29; //@line 6098
        $$13745 = $30; //@line 6098
       } else {
        $$0$lcssa = $29; //@line 6100
        $$137$lcssa = $30; //@line 6100
        label = 11; //@line 6101
        break L11;
       }
      }
      $$140 = $$046; //@line 6105
      $$23839 = $$13745; //@line 6105
     } else {
      $$0$lcssa = $$035$lcssa65; //@line 6107
      $$137$lcssa = $$036$lcssa64; //@line 6107
      label = 11; //@line 6108
     }
    } while (0);
    if ((label | 0) == 11) {
     if (!$$137$lcssa) {
      $$2 = $$0$lcssa; //@line 6114
      $$3 = 0; //@line 6114
      break;
     } else {
      $$140 = $$0$lcssa; //@line 6117
      $$23839 = $$137$lcssa; //@line 6117
     }
    }
    while (1) {
     if ((HEAP8[$$140 >> 0] | 0) == $18 << 24 >> 24) {
      $$2 = $$140; //@line 6124
      $$3 = $$23839; //@line 6124
      break L8;
     }
     $35 = $$140 + 1 | 0; //@line 6127
     $$23839 = $$23839 + -1 | 0; //@line 6128
     if (!$$23839) {
      $$2 = $35; //@line 6131
      $$3 = 0; //@line 6131
      break;
     } else {
      $$140 = $35; //@line 6134
     }
    }
   }
  }
 } while (0);
 return ($$3 | 0 ? $$2 : 0) | 0; //@line 6142
}
function _mbed_vtracef__async_cb_32($0) {
 $0 = $0 | 0;
 var $$13 = 0, $$expand_i1_val = 0, $10 = 0, $12 = 0, $14 = 0, $18 = 0, $19 = 0, $2 = 0, $21 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $34 = 0, $35 = 0, $6 = 0, $8 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12610
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12612
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12616
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12618
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 12621
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12623
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12625
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 12627
 $$13 = ($AsyncRetVal | 0) >= ($2 | 0) ? 0 : $AsyncRetVal; //@line 12629
 $18 = (HEAP32[$0 + 8 >> 2] | 0) + $$13 | 0; //@line 12631
 $19 = $2 - $$13 | 0; //@line 12632
 do {
  if (($$13 | 0) > 0) {
   $21 = HEAP32[34] | 0; //@line 12636
   if (!(($19 | 0) > 0 & ($21 | 0) != 0)) {
    if (($$13 | 0) < 1 | ($19 | 0) < 1 | $10 ^ 1) {
     break;
    }
    _snprintf($18, $19, 1062, $6) | 0; //@line 12648
    break;
   }
   $ReallocAsyncCtx6 = _emscripten_realloc_async_context(32) | 0; //@line 12651
   $23 = FUNCTION_TABLE_i[$21 & 0]() | 0; //@line 12652
   if (___async) {
    HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 12655
    $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 12656
    HEAP32[$24 >> 2] = $12; //@line 12657
    $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 12658
    HEAP32[$25 >> 2] = $18; //@line 12659
    $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 12660
    HEAP32[$26 >> 2] = $19; //@line 12661
    $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 12662
    HEAP32[$27 >> 2] = $14; //@line 12663
    $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 12664
    $$expand_i1_val = $10 & 1; //@line 12665
    HEAP8[$28 >> 0] = $$expand_i1_val; //@line 12666
    $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 12667
    HEAP32[$29 >> 2] = $6; //@line 12668
    $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 12669
    HEAP32[$30 >> 2] = $8; //@line 12670
    sp = STACKTOP; //@line 12671
    return;
   }
   HEAP32[___async_retval >> 2] = $23; //@line 12675
   ___async_unwind = 0; //@line 12676
   HEAP32[$ReallocAsyncCtx6 >> 2] = 17; //@line 12677
   $24 = $ReallocAsyncCtx6 + 4 | 0; //@line 12678
   HEAP32[$24 >> 2] = $12; //@line 12679
   $25 = $ReallocAsyncCtx6 + 8 | 0; //@line 12680
   HEAP32[$25 >> 2] = $18; //@line 12681
   $26 = $ReallocAsyncCtx6 + 12 | 0; //@line 12682
   HEAP32[$26 >> 2] = $19; //@line 12683
   $27 = $ReallocAsyncCtx6 + 16 | 0; //@line 12684
   HEAP32[$27 >> 2] = $14; //@line 12685
   $28 = $ReallocAsyncCtx6 + 20 | 0; //@line 12686
   $$expand_i1_val = $10 & 1; //@line 12687
   HEAP8[$28 >> 0] = $$expand_i1_val; //@line 12688
   $29 = $ReallocAsyncCtx6 + 24 | 0; //@line 12689
   HEAP32[$29 >> 2] = $6; //@line 12690
   $30 = $ReallocAsyncCtx6 + 28 | 0; //@line 12691
   HEAP32[$30 >> 2] = $8; //@line 12692
   sp = STACKTOP; //@line 12693
   return;
  }
 } while (0);
 $34 = HEAP32[35] | 0; //@line 12697
 $35 = HEAP32[28] | 0; //@line 12698
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12699
 FUNCTION_TABLE_vi[$34 & 127]($35); //@line 12700
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12703
  sp = STACKTOP; //@line 12704
  return;
 }
 ___async_unwind = 0; //@line 12707
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12708
 sp = STACKTOP; //@line 12709
 return;
}
function _fflush($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $12 = 0, $13 = 0, $25 = 0, $28 = 0, $34 = 0, $5 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx10 = 0, $AsyncCtx3 = 0, $AsyncCtx6 = 0, $phitmp = 0, sp = 0;
 sp = STACKTOP; //@line 5795
 do {
  if (!$0) {
   do {
    if (!(HEAP32[72] | 0)) {
     $34 = 0; //@line 5803
    } else {
     $12 = HEAP32[72] | 0; //@line 5805
     $AsyncCtx10 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5806
     $13 = _fflush($12) | 0; //@line 5807
     if (___async) {
      HEAP32[$AsyncCtx10 >> 2] = 54; //@line 5810
      sp = STACKTOP; //@line 5811
      return 0; //@line 5812
     } else {
      _emscripten_free_async_context($AsyncCtx10 | 0); //@line 5814
      $34 = $13; //@line 5815
      break;
     }
    }
   } while (0);
   $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 5821
   L9 : do {
    if (!$$02325) {
     $$024$lcssa = $34; //@line 5825
    } else {
     $$02327 = $$02325; //@line 5827
     $$02426 = $34; //@line 5827
     while (1) {
      if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
       $28 = ___lockfile($$02327) | 0; //@line 5834
      } else {
       $28 = 0; //@line 5836
      }
      if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
       $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5844
       $25 = ___fflush_unlocked($$02327) | 0; //@line 5845
       if (___async) {
        break;
       }
       _emscripten_free_async_context($AsyncCtx | 0); //@line 5850
       $$1 = $25 | $$02426; //@line 5852
      } else {
       $$1 = $$02426; //@line 5854
      }
      if ($28 | 0) {
       ___unlockfile($$02327); //@line 5858
      }
      $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 5861
      if (!$$023) {
       $$024$lcssa = $$1; //@line 5864
       break L9;
      } else {
       $$02327 = $$023; //@line 5867
       $$02426 = $$1; //@line 5867
      }
     }
     HEAP32[$AsyncCtx >> 2] = 55; //@line 5870
     HEAP32[$AsyncCtx + 4 >> 2] = $$02426; //@line 5872
     HEAP32[$AsyncCtx + 8 >> 2] = $28; //@line 5874
     HEAP32[$AsyncCtx + 12 >> 2] = $$02327; //@line 5876
     sp = STACKTOP; //@line 5877
     return 0; //@line 5878
    }
   } while (0);
   ___ofl_unlock(); //@line 5881
   $$0 = $$024$lcssa; //@line 5882
  } else {
   if ((HEAP32[$0 + 76 >> 2] | 0) <= -1) {
    $AsyncCtx6 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5888
    $5 = ___fflush_unlocked($0) | 0; //@line 5889
    if (___async) {
     HEAP32[$AsyncCtx6 >> 2] = 52; //@line 5892
     sp = STACKTOP; //@line 5893
     return 0; //@line 5894
    } else {
     _emscripten_free_async_context($AsyncCtx6 | 0); //@line 5896
     $$0 = $5; //@line 5897
     break;
    }
   }
   $phitmp = (___lockfile($0) | 0) == 0; //@line 5902
   $AsyncCtx3 = _emscripten_alloc_async_context(12, sp) | 0; //@line 5903
   $7 = ___fflush_unlocked($0) | 0; //@line 5904
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 53; //@line 5907
    HEAP8[$AsyncCtx3 + 4 >> 0] = $phitmp & 1; //@line 5910
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 5912
    sp = STACKTOP; //@line 5913
    return 0; //@line 5914
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5916
   if ($phitmp) {
    $$0 = $7; //@line 5918
   } else {
    ___unlockfile($0); //@line 5920
    $$0 = $7; //@line 5921
   }
  }
 } while (0);
 return $$0 | 0; //@line 5925
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $13 = 0, $19 = 0, $22 = 0, $23 = 0, $25 = 0, $28 = 0, $39 = 0, $50 = 0, $53 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 10249
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 10255
  } else {
   if (!(__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0)) {
    $50 = HEAP32[$0 + 8 >> 2] | 0; //@line 10261
    $53 = HEAP32[(HEAP32[$50 >> 2] | 0) + 24 >> 2] | 0; //@line 10264
    $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 10265
    FUNCTION_TABLE_viiiii[$53 & 3]($50, $1, $2, $3, $4); //@line 10266
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 68; //@line 10269
     sp = STACKTOP; //@line 10270
     return;
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 10273
     break;
    }
   }
   if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
    $13 = $1 + 20 | 0; //@line 10281
    if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
     HEAP32[$1 + 32 >> 2] = $3; //@line 10286
     $19 = $1 + 44 | 0; //@line 10287
     if ((HEAP32[$19 >> 2] | 0) == 4) {
      break;
     }
     $22 = $1 + 52 | 0; //@line 10293
     HEAP8[$22 >> 0] = 0; //@line 10294
     $23 = $1 + 53 | 0; //@line 10295
     HEAP8[$23 >> 0] = 0; //@line 10296
     $25 = HEAP32[$0 + 8 >> 2] | 0; //@line 10298
     $28 = HEAP32[(HEAP32[$25 >> 2] | 0) + 20 >> 2] | 0; //@line 10301
     $AsyncCtx = _emscripten_alloc_async_context(28, sp) | 0; //@line 10302
     FUNCTION_TABLE_viiiiii[$28 & 3]($25, $1, $2, $2, 1, $4); //@line 10303
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 67; //@line 10306
      HEAP32[$AsyncCtx + 4 >> 2] = $23; //@line 10308
      HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10310
      HEAP32[$AsyncCtx + 12 >> 2] = $13; //@line 10312
      HEAP32[$AsyncCtx + 16 >> 2] = $1; //@line 10314
      HEAP32[$AsyncCtx + 20 >> 2] = $22; //@line 10316
      HEAP32[$AsyncCtx + 24 >> 2] = $19; //@line 10318
      sp = STACKTOP; //@line 10319
      return;
     }
     _emscripten_free_async_context($AsyncCtx | 0); //@line 10322
     if (!(HEAP8[$23 >> 0] | 0)) {
      $$037$off038 = 4; //@line 10326
      label = 13; //@line 10327
     } else {
      if (!(HEAP8[$22 >> 0] | 0)) {
       $$037$off038 = 3; //@line 10332
       label = 13; //@line 10333
      } else {
       $$037$off039 = 3; //@line 10335
      }
     }
     if ((label | 0) == 13) {
      HEAP32[$13 >> 2] = $2; //@line 10339
      $39 = $1 + 40 | 0; //@line 10340
      HEAP32[$39 >> 2] = (HEAP32[$39 >> 2] | 0) + 1; //@line 10343
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 10353
        $$037$off039 = $$037$off038; //@line 10354
       } else {
        $$037$off039 = $$037$off038; //@line 10356
       }
      } else {
       $$037$off039 = $$037$off038; //@line 10359
      }
     }
     HEAP32[$19 >> 2] = $$037$off039; //@line 10362
     break;
    }
   }
   if (($3 | 0) == 1) {
    HEAP32[$1 + 32 >> 2] = 1; //@line 10369
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_33($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $24 = 0, $26 = 0, $28 = 0, $30 = 0, $32 = 0, $34 = 0, $36 = 0, $38 = 0, $4 = 0, $40 = 0, $42 = 0, $44 = 0, $46 = 0, $48 = 0, $50 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 12719
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12721
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12723
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12725
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12727
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12729
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12731
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 12733
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12735
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 12737
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 12739
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 12741
 $24 = HEAP32[$0 + 48 >> 2] | 0; //@line 12743
 $26 = HEAP32[$0 + 52 >> 2] | 0; //@line 12745
 $28 = HEAP32[$0 + 56 >> 2] | 0; //@line 12747
 $30 = HEAP32[$0 + 60 >> 2] | 0; //@line 12749
 $32 = HEAP32[$0 + 64 >> 2] | 0; //@line 12751
 $34 = HEAP32[$0 + 68 >> 2] | 0; //@line 12753
 $36 = HEAP32[$0 + 72 >> 2] | 0; //@line 12755
 $38 = HEAP32[$0 + 76 >> 2] | 0; //@line 12757
 $40 = HEAP32[$0 + 80 >> 2] | 0; //@line 12759
 $42 = HEAP32[$0 + 84 >> 2] | 0; //@line 12761
 $44 = HEAP32[$0 + 88 >> 2] | 0; //@line 12763
 $46 = HEAP8[$0 + 92 >> 0] & 1; //@line 12766
 $48 = HEAP32[$0 + 96 >> 2] | 0; //@line 12768
 $50 = HEAP32[$0 + 100 >> 2] | 0; //@line 12770
 $55 = ($38 | 0 ? 4 : 0) + $38 + (HEAP32[___async_retval >> 2] | 0) | 0; //@line 12776
 $56 = HEAP32[33] | 0; //@line 12777
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(100) | 0; //@line 12778
 $57 = FUNCTION_TABLE_ii[$56 & 1]($55) | 0; //@line 12779
 if (!___async) {
  HEAP32[___async_retval >> 2] = $57; //@line 12783
  ___async_unwind = 0; //@line 12784
 }
 HEAP32[$ReallocAsyncCtx5 >> 2] = 15; //@line 12786
 HEAP32[$ReallocAsyncCtx5 + 4 >> 2] = $2; //@line 12788
 HEAP32[$ReallocAsyncCtx5 + 8 >> 2] = $4; //@line 12790
 HEAP32[$ReallocAsyncCtx5 + 12 >> 2] = $6; //@line 12792
 HEAP32[$ReallocAsyncCtx5 + 16 >> 2] = $8; //@line 12794
 HEAP32[$ReallocAsyncCtx5 + 20 >> 2] = $10; //@line 12796
 HEAP32[$ReallocAsyncCtx5 + 24 >> 2] = $12; //@line 12798
 HEAP32[$ReallocAsyncCtx5 + 28 >> 2] = $14; //@line 12800
 HEAP32[$ReallocAsyncCtx5 + 32 >> 2] = $16; //@line 12802
 HEAP32[$ReallocAsyncCtx5 + 36 >> 2] = $18; //@line 12804
 HEAP32[$ReallocAsyncCtx5 + 40 >> 2] = $20; //@line 12806
 HEAP32[$ReallocAsyncCtx5 + 44 >> 2] = $22; //@line 12808
 HEAP32[$ReallocAsyncCtx5 + 48 >> 2] = $24; //@line 12810
 HEAP32[$ReallocAsyncCtx5 + 52 >> 2] = $26; //@line 12812
 HEAP32[$ReallocAsyncCtx5 + 56 >> 2] = $28; //@line 12814
 HEAP32[$ReallocAsyncCtx5 + 60 >> 2] = $30; //@line 12816
 HEAP32[$ReallocAsyncCtx5 + 64 >> 2] = $32; //@line 12818
 HEAP32[$ReallocAsyncCtx5 + 68 >> 2] = $34; //@line 12820
 HEAP32[$ReallocAsyncCtx5 + 72 >> 2] = $36; //@line 12822
 HEAP32[$ReallocAsyncCtx5 + 76 >> 2] = $40; //@line 12824
 HEAP32[$ReallocAsyncCtx5 + 80 >> 2] = $42; //@line 12826
 HEAP32[$ReallocAsyncCtx5 + 84 >> 2] = $44; //@line 12828
 HEAP8[$ReallocAsyncCtx5 + 88 >> 0] = $46 & 1; //@line 12831
 HEAP32[$ReallocAsyncCtx5 + 92 >> 2] = $48; //@line 12833
 HEAP32[$ReallocAsyncCtx5 + 96 >> 2] = $50; //@line 12835
 sp = STACKTOP; //@line 12836
 return;
}
function _mbed_error_vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $4 = 0, $9 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11486
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11488
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11490
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11492
 if (($AsyncRetVal | 0) <= 0) {
  return;
 }
 if (!(HEAP32[1002] | 0)) {
  _serial_init(4012, 2, 3); //@line 11500
 }
 $9 = HEAP8[$4 >> 0] | 0; //@line 11502
 if (0 == 13 | $9 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 11508
  _serial_putc(4012, $9 << 24 >> 24); //@line 11509
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 42; //@line 11512
   $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 11513
   HEAP32[$18 >> 2] = 0; //@line 11514
   $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 11515
   HEAP32[$19 >> 2] = $AsyncRetVal; //@line 11516
   $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 11517
   HEAP32[$20 >> 2] = $2; //@line 11518
   $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 11519
   HEAP8[$21 >> 0] = $9; //@line 11520
   $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 11521
   HEAP32[$22 >> 2] = $4; //@line 11522
   sp = STACKTOP; //@line 11523
   return;
  }
  ___async_unwind = 0; //@line 11526
  HEAP32[$ReallocAsyncCtx2 >> 2] = 42; //@line 11527
  $18 = $ReallocAsyncCtx2 + 4 | 0; //@line 11528
  HEAP32[$18 >> 2] = 0; //@line 11529
  $19 = $ReallocAsyncCtx2 + 8 | 0; //@line 11530
  HEAP32[$19 >> 2] = $AsyncRetVal; //@line 11531
  $20 = $ReallocAsyncCtx2 + 12 | 0; //@line 11532
  HEAP32[$20 >> 2] = $2; //@line 11533
  $21 = $ReallocAsyncCtx2 + 16 | 0; //@line 11534
  HEAP8[$21 >> 0] = $9; //@line 11535
  $22 = $ReallocAsyncCtx2 + 20 | 0; //@line 11536
  HEAP32[$22 >> 2] = $4; //@line 11537
  sp = STACKTOP; //@line 11538
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 11541
  _serial_putc(4012, 13); //@line 11542
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 11545
   $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 11546
   HEAP8[$12 >> 0] = $9; //@line 11547
   $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 11548
   HEAP32[$13 >> 2] = 0; //@line 11549
   $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 11550
   HEAP32[$14 >> 2] = $AsyncRetVal; //@line 11551
   $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 11552
   HEAP32[$15 >> 2] = $2; //@line 11553
   $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 11554
   HEAP32[$16 >> 2] = $4; //@line 11555
   sp = STACKTOP; //@line 11556
   return;
  }
  ___async_unwind = 0; //@line 11559
  HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 11560
  $12 = $ReallocAsyncCtx3 + 4 | 0; //@line 11561
  HEAP8[$12 >> 0] = $9; //@line 11562
  $13 = $ReallocAsyncCtx3 + 8 | 0; //@line 11563
  HEAP32[$13 >> 2] = 0; //@line 11564
  $14 = $ReallocAsyncCtx3 + 12 | 0; //@line 11565
  HEAP32[$14 >> 2] = $AsyncRetVal; //@line 11566
  $15 = $ReallocAsyncCtx3 + 16 | 0; //@line 11567
  HEAP32[$15 >> 2] = $2; //@line 11568
  $16 = $ReallocAsyncCtx3 + 20 | 0; //@line 11569
  HEAP32[$16 >> 2] = $4; //@line 11570
  sp = STACKTOP; //@line 11571
  return;
 }
}
function _mbed_error_vfprintf__async_cb_22($0) {
 $0 = $0 | 0;
 var $10 = 0, $12 = 0, $13 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 11579
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11583
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11585
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11589
 $12 = (HEAP32[$0 + 4 >> 2] | 0) + 1 | 0; //@line 11590
 if (($12 | 0) == ($4 | 0)) {
  return;
 }
 $13 = HEAP8[$10 + $12 >> 0] | 0; //@line 11596
 if ((HEAP8[$0 + 16 >> 0] | 0) == 13 | $13 << 24 >> 24 != 10) {
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 11602
  _serial_putc(4012, $13 << 24 >> 24); //@line 11603
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 42; //@line 11606
   $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 11607
   HEAP32[$22 >> 2] = $12; //@line 11608
   $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 11609
   HEAP32[$23 >> 2] = $4; //@line 11610
   $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 11611
   HEAP32[$24 >> 2] = $6; //@line 11612
   $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 11613
   HEAP8[$25 >> 0] = $13; //@line 11614
   $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 11615
   HEAP32[$26 >> 2] = $10; //@line 11616
   sp = STACKTOP; //@line 11617
   return;
  }
  ___async_unwind = 0; //@line 11620
  HEAP32[$ReallocAsyncCtx2 >> 2] = 42; //@line 11621
  $22 = $ReallocAsyncCtx2 + 4 | 0; //@line 11622
  HEAP32[$22 >> 2] = $12; //@line 11623
  $23 = $ReallocAsyncCtx2 + 8 | 0; //@line 11624
  HEAP32[$23 >> 2] = $4; //@line 11625
  $24 = $ReallocAsyncCtx2 + 12 | 0; //@line 11626
  HEAP32[$24 >> 2] = $6; //@line 11627
  $25 = $ReallocAsyncCtx2 + 16 | 0; //@line 11628
  HEAP8[$25 >> 0] = $13; //@line 11629
  $26 = $ReallocAsyncCtx2 + 20 | 0; //@line 11630
  HEAP32[$26 >> 2] = $10; //@line 11631
  sp = STACKTOP; //@line 11632
  return;
 } else {
  $ReallocAsyncCtx3 = _emscripten_realloc_async_context(24) | 0; //@line 11635
  _serial_putc(4012, 13); //@line 11636
  if (___async) {
   HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 11639
   $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 11640
   HEAP8[$16 >> 0] = $13; //@line 11641
   $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 11642
   HEAP32[$17 >> 2] = $12; //@line 11643
   $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 11644
   HEAP32[$18 >> 2] = $4; //@line 11645
   $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 11646
   HEAP32[$19 >> 2] = $6; //@line 11647
   $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 11648
   HEAP32[$20 >> 2] = $10; //@line 11649
   sp = STACKTOP; //@line 11650
   return;
  }
  ___async_unwind = 0; //@line 11653
  HEAP32[$ReallocAsyncCtx3 >> 2] = 41; //@line 11654
  $16 = $ReallocAsyncCtx3 + 4 | 0; //@line 11655
  HEAP8[$16 >> 0] = $13; //@line 11656
  $17 = $ReallocAsyncCtx3 + 8 | 0; //@line 11657
  HEAP32[$17 >> 2] = $12; //@line 11658
  $18 = $ReallocAsyncCtx3 + 12 | 0; //@line 11659
  HEAP32[$18 >> 2] = $4; //@line 11660
  $19 = $ReallocAsyncCtx3 + 16 | 0; //@line 11661
  HEAP32[$19 >> 2] = $6; //@line 11662
  $20 = $ReallocAsyncCtx3 + 20 | 0; //@line 11663
  HEAP32[$20 >> 2] = $10; //@line 11664
  sp = STACKTOP; //@line 11665
  return;
 }
}
function ___stdio_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $12 = 0, $13 = 0, $17 = 0, $20 = 0, $25 = 0, $27 = 0, $3 = 0, $37 = 0, $38 = 0, $4 = 0, $44 = 0, $5 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 4836
 STACKTOP = STACKTOP + 48 | 0; //@line 4837
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 4837
 $vararg_buffer3 = sp + 16 | 0; //@line 4838
 $vararg_buffer = sp; //@line 4839
 $3 = sp + 32 | 0; //@line 4840
 $4 = $0 + 28 | 0; //@line 4841
 $5 = HEAP32[$4 >> 2] | 0; //@line 4842
 HEAP32[$3 >> 2] = $5; //@line 4843
 $7 = $0 + 20 | 0; //@line 4845
 $9 = (HEAP32[$7 >> 2] | 0) - $5 | 0; //@line 4847
 HEAP32[$3 + 4 >> 2] = $9; //@line 4848
 HEAP32[$3 + 8 >> 2] = $1; //@line 4850
 HEAP32[$3 + 12 >> 2] = $2; //@line 4852
 $12 = $9 + $2 | 0; //@line 4853
 $13 = $0 + 60 | 0; //@line 4854
 HEAP32[$vararg_buffer >> 2] = HEAP32[$13 >> 2]; //@line 4857
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 4859
 HEAP32[$vararg_buffer + 8 >> 2] = 2; //@line 4861
 $17 = ___syscall_ret(___syscall146(146, $vararg_buffer | 0) | 0) | 0; //@line 4863
 L1 : do {
  if (($12 | 0) == ($17 | 0)) {
   label = 3; //@line 4867
  } else {
   $$04756 = 2; //@line 4869
   $$04855 = $12; //@line 4869
   $$04954 = $3; //@line 4869
   $27 = $17; //@line 4869
   while (1) {
    if (($27 | 0) < 0) {
     break;
    }
    $$04855 = $$04855 - $27 | 0; //@line 4875
    $37 = HEAP32[$$04954 + 4 >> 2] | 0; //@line 4877
    $38 = $27 >>> 0 > $37 >>> 0; //@line 4878
    $$150 = $38 ? $$04954 + 8 | 0 : $$04954; //@line 4880
    $$1 = $$04756 + ($38 << 31 >> 31) | 0; //@line 4882
    $$0 = $27 - ($38 ? $37 : 0) | 0; //@line 4884
    HEAP32[$$150 >> 2] = (HEAP32[$$150 >> 2] | 0) + $$0; //@line 4887
    $44 = $$150 + 4 | 0; //@line 4888
    HEAP32[$44 >> 2] = (HEAP32[$44 >> 2] | 0) - $$0; //@line 4891
    HEAP32[$vararg_buffer3 >> 2] = HEAP32[$13 >> 2]; //@line 4894
    HEAP32[$vararg_buffer3 + 4 >> 2] = $$150; //@line 4896
    HEAP32[$vararg_buffer3 + 8 >> 2] = $$1; //@line 4898
    $27 = ___syscall_ret(___syscall146(146, $vararg_buffer3 | 0) | 0) | 0; //@line 4900
    if (($$04855 | 0) == ($27 | 0)) {
     label = 3; //@line 4903
     break L1;
    } else {
     $$04756 = $$1; //@line 4906
     $$04954 = $$150; //@line 4906
    }
   }
   HEAP32[$0 + 16 >> 2] = 0; //@line 4910
   HEAP32[$4 >> 2] = 0; //@line 4911
   HEAP32[$7 >> 2] = 0; //@line 4912
   HEAP32[$0 >> 2] = HEAP32[$0 >> 2] | 32; //@line 4915
   if (($$04756 | 0) == 2) {
    $$051 = 0; //@line 4918
   } else {
    $$051 = $2 - (HEAP32[$$04954 + 4 >> 2] | 0) | 0; //@line 4923
   }
  }
 } while (0);
 if ((label | 0) == 3) {
  $20 = HEAP32[$0 + 44 >> 2] | 0; //@line 4929
  HEAP32[$0 + 16 >> 2] = $20 + (HEAP32[$0 + 48 >> 2] | 0); //@line 4934
  $25 = $20; //@line 4935
  HEAP32[$4 >> 2] = $25; //@line 4936
  HEAP32[$7 >> 2] = $25; //@line 4937
  $$051 = $2; //@line 4938
 }
 STACKTOP = sp; //@line 4940
 return $$051 | 0; //@line 4940
}
function _mbed_error_vfprintf($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$01213 = 0, $$014 = 0, $2 = 0, $24 = 0, $3 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, $AsyncCtx7 = 0, label = 0, sp = 0, $$01213$looptemp = 0;
 sp = STACKTOP; //@line 1393
 STACKTOP = STACKTOP + 128 | 0; //@line 1394
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 1394
 $2 = sp; //@line 1395
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1396
 $3 = _vsnprintf($2, 128, $0, $1) | 0; //@line 1397
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 40; //@line 1400
  HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 1402
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 1404
  sp = STACKTOP; //@line 1405
  STACKTOP = sp; //@line 1406
  return;
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 1408
 if (($3 | 0) <= 0) {
  STACKTOP = sp; //@line 1411
  return;
 }
 if (!(HEAP32[1002] | 0)) {
  _serial_init(4012, 2, 3); //@line 1416
  $$01213 = 0; //@line 1417
  $$014 = 0; //@line 1417
 } else {
  $$01213 = 0; //@line 1419
  $$014 = 0; //@line 1419
 }
 while (1) {
  $$01213$looptemp = $$01213;
  $$01213 = HEAP8[$2 + $$014 >> 0] | 0; //@line 1423
  if (!($$01213$looptemp << 24 >> 24 == 13 | $$01213 << 24 >> 24 != 10)) {
   $AsyncCtx7 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1428
   _serial_putc(4012, 13); //@line 1429
   if (___async) {
    label = 8; //@line 1432
    break;
   }
   _emscripten_free_async_context($AsyncCtx7 | 0); //@line 1435
  }
  $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 1438
  _serial_putc(4012, $$01213 << 24 >> 24); //@line 1439
  if (___async) {
   label = 11; //@line 1442
   break;
  }
  _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1445
  $24 = $$014 + 1 | 0; //@line 1446
  if (($24 | 0) == ($3 | 0)) {
   label = 13; //@line 1449
   break;
  } else {
   $$014 = $24; //@line 1452
  }
 }
 if ((label | 0) == 8) {
  HEAP32[$AsyncCtx7 >> 2] = 41; //@line 1456
  HEAP8[$AsyncCtx7 + 4 >> 0] = $$01213; //@line 1458
  HEAP32[$AsyncCtx7 + 8 >> 2] = $$014; //@line 1460
  HEAP32[$AsyncCtx7 + 12 >> 2] = $3; //@line 1462
  HEAP32[$AsyncCtx7 + 16 >> 2] = $2; //@line 1464
  HEAP32[$AsyncCtx7 + 20 >> 2] = $2; //@line 1466
  sp = STACKTOP; //@line 1467
  STACKTOP = sp; //@line 1468
  return;
 } else if ((label | 0) == 11) {
  HEAP32[$AsyncCtx3 >> 2] = 42; //@line 1471
  HEAP32[$AsyncCtx3 + 4 >> 2] = $$014; //@line 1473
  HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 1475
  HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 1477
  HEAP8[$AsyncCtx3 + 16 >> 0] = $$01213; //@line 1479
  HEAP32[$AsyncCtx3 + 20 >> 2] = $2; //@line 1481
  sp = STACKTOP; //@line 1482
  STACKTOP = sp; //@line 1483
  return;
 } else if ((label | 0) == 13) {
  STACKTOP = sp; //@line 1486
  return;
 }
}
function _memcpy(dest, src, num) {
 dest = dest | 0;
 src = src | 0;
 num = num | 0;
 var ret = 0, aligned_dest_end = 0, block_aligned_dest_end = 0, dest_end = 0;
 if ((num | 0) >= 8192) {
  return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0; //@line 13501
 }
 ret = dest | 0; //@line 13504
 dest_end = dest + num | 0; //@line 13505
 if ((dest & 3) == (src & 3)) {
  while (dest & 3) {
   if (!num) return ret | 0; //@line 13509
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13510
   dest = dest + 1 | 0; //@line 13511
   src = src + 1 | 0; //@line 13512
   num = num - 1 | 0; //@line 13513
  }
  aligned_dest_end = dest_end & -4 | 0; //@line 13515
  block_aligned_dest_end = aligned_dest_end - 64 | 0; //@line 13516
  while ((dest | 0) <= (block_aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13518
   HEAP32[dest + 4 >> 2] = HEAP32[src + 4 >> 2]; //@line 13519
   HEAP32[dest + 8 >> 2] = HEAP32[src + 8 >> 2]; //@line 13520
   HEAP32[dest + 12 >> 2] = HEAP32[src + 12 >> 2]; //@line 13521
   HEAP32[dest + 16 >> 2] = HEAP32[src + 16 >> 2]; //@line 13522
   HEAP32[dest + 20 >> 2] = HEAP32[src + 20 >> 2]; //@line 13523
   HEAP32[dest + 24 >> 2] = HEAP32[src + 24 >> 2]; //@line 13524
   HEAP32[dest + 28 >> 2] = HEAP32[src + 28 >> 2]; //@line 13525
   HEAP32[dest + 32 >> 2] = HEAP32[src + 32 >> 2]; //@line 13526
   HEAP32[dest + 36 >> 2] = HEAP32[src + 36 >> 2]; //@line 13527
   HEAP32[dest + 40 >> 2] = HEAP32[src + 40 >> 2]; //@line 13528
   HEAP32[dest + 44 >> 2] = HEAP32[src + 44 >> 2]; //@line 13529
   HEAP32[dest + 48 >> 2] = HEAP32[src + 48 >> 2]; //@line 13530
   HEAP32[dest + 52 >> 2] = HEAP32[src + 52 >> 2]; //@line 13531
   HEAP32[dest + 56 >> 2] = HEAP32[src + 56 >> 2]; //@line 13532
   HEAP32[dest + 60 >> 2] = HEAP32[src + 60 >> 2]; //@line 13533
   dest = dest + 64 | 0; //@line 13534
   src = src + 64 | 0; //@line 13535
  }
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 13538
   dest = dest + 4 | 0; //@line 13539
   src = src + 4 | 0; //@line 13540
  }
 } else {
  aligned_dest_end = dest_end - 4 | 0; //@line 13544
  while ((dest | 0) < (aligned_dest_end | 0)) {
   HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13546
   HEAP8[dest + 1 >> 0] = HEAP8[src + 1 >> 0] | 0; //@line 13547
   HEAP8[dest + 2 >> 0] = HEAP8[src + 2 >> 0] | 0; //@line 13548
   HEAP8[dest + 3 >> 0] = HEAP8[src + 3 >> 0] | 0; //@line 13549
   dest = dest + 4 | 0; //@line 13550
   src = src + 4 | 0; //@line 13551
  }
 }
 while ((dest | 0) < (dest_end | 0)) {
  HEAP8[dest >> 0] = HEAP8[src >> 0] | 0; //@line 13556
  dest = dest + 1 | 0; //@line 13557
  src = src + 1 | 0; //@line 13558
 }
 return ret | 0; //@line 13560
}
function _mbed_trace_array($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$042$ph = 0, $$04353 = 0, $$04552 = 0, $$04651 = 0, $$04750 = 0, $$2$ph = 0, $11 = 0, $15 = 0, $16 = 0, $2 = 0, $24 = 0, $27 = 0, $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 945
 STACKTOP = STACKTOP + 16 | 0; //@line 946
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 946
 $vararg_buffer = sp; //@line 947
 $2 = HEAP32[37] | 0; //@line 948
 do {
  if ($2 | 0) {
   $AsyncCtx = _emscripten_alloc_async_context(20, sp) | 0; //@line 952
   FUNCTION_TABLE_v[$2 & 0](); //@line 953
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 21; //@line 956
    HEAP16[$AsyncCtx + 4 >> 1] = $1; //@line 958
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 960
    HEAP32[$AsyncCtx + 12 >> 2] = $vararg_buffer; //@line 962
    HEAP32[$AsyncCtx + 16 >> 2] = $vararg_buffer; //@line 964
    sp = STACKTOP; //@line 965
    STACKTOP = sp; //@line 966
    return 0; //@line 966
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 968
    HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 971
    break;
   }
  }
 } while (0);
 $11 = HEAP32[32] | 0; //@line 977
 $15 = (HEAP32[30] | 0) - $11 + (HEAP32[31] | 0) | 0; //@line 981
 $16 = $1 & 65535; //@line 982
 if ($1 << 16 >> 16 == 0 | ($11 | 0) == 0 | ($15 | 0) == 0) {
  $$0 = 4596; //@line 989
  STACKTOP = sp; //@line 990
  return $$0 | 0; //@line 990
 }
 if (!$0) {
  $$0 = 1067; //@line 994
  STACKTOP = sp; //@line 995
  return $$0 | 0; //@line 995
 }
 HEAP8[$11 >> 0] = 0; //@line 997
 $$04353 = $0; //@line 998
 $$04552 = $11; //@line 998
 $$04651 = 0; //@line 998
 $$04750 = $15; //@line 998
 while (1) {
  if (($$04750 | 0) < 4) {
   $$042$ph = 42; //@line 1002
   $$2$ph = $$04552; //@line 1002
   break;
  }
  HEAP32[$vararg_buffer >> 2] = HEAPU8[$$04353 >> 0]; //@line 1007
  $24 = _snprintf($$04552, $$04750, 1074, $vararg_buffer) | 0; //@line 1008
  $27 = $$04552 + $24 | 0; //@line 1012
  if (($24 | 0) < 1 | ($$04750 | 0) < ($24 | 0)) {
   $$042$ph = 0; //@line 1014
   $$2$ph = $$04552; //@line 1014
   break;
  }
  $$04651 = $$04651 + 1 | 0; //@line 1019
  if (($$04651 | 0) >= ($16 | 0)) {
   $$042$ph = 0; //@line 1024
   $$2$ph = $27; //@line 1024
   break;
  } else {
   $$04353 = $$04353 + 1 | 0; //@line 1022
   $$04552 = $27; //@line 1022
   $$04750 = $$04750 - $24 | 0; //@line 1022
  }
 }
 if ($$2$ph >>> 0 > $11 >>> 0) {
  HEAP8[$$2$ph + -1 >> 0] = $$042$ph; //@line 1031
 }
 HEAP32[32] = $$2$ph; //@line 1033
 $$0 = $11; //@line 1034
 STACKTOP = sp; //@line 1035
 return $$0 | 0; //@line 1035
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0, $$2 = 0, $17 = 0, $18 = 0, $3 = 0, $6 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 9750
 STACKTOP = STACKTOP + 64 | 0; //@line 9751
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(64); //@line 9751
 $3 = sp; //@line 9752
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, 0) | 0) {
  $$2 = 1; //@line 9755
 } else {
  if (!$1) {
   $$2 = 0; //@line 9759
  } else {
   $AsyncCtx3 = _emscripten_alloc_async_context(16, sp) | 0; //@line 9761
   $6 = ___dynamic_cast($1, 24, 8, 0) | 0; //@line 9762
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 62; //@line 9765
    HEAP32[$AsyncCtx3 + 4 >> 2] = $3; //@line 9767
    HEAP32[$AsyncCtx3 + 8 >> 2] = $0; //@line 9769
    HEAP32[$AsyncCtx3 + 12 >> 2] = $2; //@line 9771
    sp = STACKTOP; //@line 9772
    STACKTOP = sp; //@line 9773
    return 0; //@line 9773
   }
   _emscripten_free_async_context($AsyncCtx3 | 0); //@line 9775
   if (!$6) {
    $$2 = 0; //@line 9778
   } else {
    dest = $3 + 4 | 0; //@line 9781
    stop = dest + 52 | 0; //@line 9781
    do {
     HEAP32[dest >> 2] = 0; //@line 9781
     dest = dest + 4 | 0; //@line 9781
    } while ((dest | 0) < (stop | 0));
    HEAP32[$3 >> 2] = $6; //@line 9782
    HEAP32[$3 + 8 >> 2] = $0; //@line 9784
    HEAP32[$3 + 12 >> 2] = -1; //@line 9786
    HEAP32[$3 + 48 >> 2] = 1; //@line 9788
    $17 = HEAP32[(HEAP32[$6 >> 2] | 0) + 28 >> 2] | 0; //@line 9791
    $18 = HEAP32[$2 >> 2] | 0; //@line 9792
    $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 9793
    FUNCTION_TABLE_viiii[$17 & 3]($6, $3, $18, 1); //@line 9794
    if (___async) {
     HEAP32[$AsyncCtx >> 2] = 63; //@line 9797
     HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9799
     HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 9801
     HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 9803
     sp = STACKTOP; //@line 9804
     STACKTOP = sp; //@line 9805
     return 0; //@line 9805
    }
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9807
    if ((HEAP32[$3 + 24 >> 2] | 0) == 1) {
     HEAP32[$2 >> 2] = HEAP32[$3 + 16 >> 2]; //@line 9814
     $$0 = 1; //@line 9815
    } else {
     $$0 = 0; //@line 9817
    }
    $$2 = $$0; //@line 9819
   }
  }
 }
 STACKTOP = sp; //@line 9823
 return $$2 | 0; //@line 9823
}
function _vsnprintf($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $11 = 0, $14 = 0, $16 = 0, $17 = 0, $19 = 0, $26 = 0, $4 = 0, $5 = 0, $AsyncCtx = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP; //@line 9557
 STACKTOP = STACKTOP + 128 | 0; //@line 9558
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(128); //@line 9558
 $4 = sp + 124 | 0; //@line 9559
 $5 = sp; //@line 9560
 dest = $5; //@line 9561
 src = 536; //@line 9561
 stop = dest + 124 | 0; //@line 9561
 do {
  HEAP32[dest >> 2] = HEAP32[src >> 2]; //@line 9561
  dest = dest + 4 | 0; //@line 9561
  src = src + 4 | 0; //@line 9561
 } while ((dest | 0) < (stop | 0));
 if (($1 + -1 | 0) >>> 0 > 2147483646) {
  if (!$1) {
   $$014 = $4; //@line 9567
   $$015 = 1; //@line 9567
   label = 4; //@line 9568
  } else {
   HEAP32[(___errno_location() | 0) >> 2] = 75; //@line 9571
   $$0 = -1; //@line 9572
  }
 } else {
  $$014 = $0; //@line 9575
  $$015 = $1; //@line 9575
  label = 4; //@line 9576
 }
 if ((label | 0) == 4) {
  $11 = -2 - $$014 | 0; //@line 9580
  $$$015 = $$015 >>> 0 > $11 >>> 0 ? $11 : $$015; //@line 9582
  HEAP32[$5 + 48 >> 2] = $$$015; //@line 9584
  $14 = $5 + 20 | 0; //@line 9585
  HEAP32[$14 >> 2] = $$014; //@line 9586
  HEAP32[$5 + 44 >> 2] = $$014; //@line 9588
  $16 = $$014 + $$$015 | 0; //@line 9589
  $17 = $5 + 16 | 0; //@line 9590
  HEAP32[$17 >> 2] = $16; //@line 9591
  HEAP32[$5 + 28 >> 2] = $16; //@line 9593
  $AsyncCtx = _emscripten_alloc_async_context(24, sp) | 0; //@line 9594
  $19 = _vfprintf($5, $2, $3) | 0; //@line 9595
  if (___async) {
   HEAP32[$AsyncCtx >> 2] = 60; //@line 9598
   HEAP32[$AsyncCtx + 4 >> 2] = $$$015; //@line 9600
   HEAP32[$AsyncCtx + 8 >> 2] = $5; //@line 9602
   HEAP32[$AsyncCtx + 12 >> 2] = $4; //@line 9604
   HEAP32[$AsyncCtx + 16 >> 2] = $14; //@line 9606
   HEAP32[$AsyncCtx + 20 >> 2] = $17; //@line 9608
   sp = STACKTOP; //@line 9609
   STACKTOP = sp; //@line 9610
   return 0; //@line 9610
  }
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9612
  if (!$$$015) {
   $$0 = $19; //@line 9615
  } else {
   $26 = HEAP32[$14 >> 2] | 0; //@line 9617
   HEAP8[$26 + ((($26 | 0) == (HEAP32[$17 >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 9622
   $$0 = $19; //@line 9623
  }
 }
 STACKTOP = sp; //@line 9626
 return $$0 | 0; //@line 9626
}
function ___mo_lookup($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$090 = 0, $$094 = 0, $$4 = 0, $10 = 0, $13 = 0, $17 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $31 = 0, $35 = 0, $4 = 0, $44 = 0, $46 = 0, $49 = 0, $53 = 0, $63 = 0, $7 = 0;
 $4 = (HEAP32[$0 >> 2] | 0) + 1794895138 | 0; //@line 5546
 $7 = _swapc(HEAP32[$0 + 8 >> 2] | 0, $4) | 0; //@line 5549
 $10 = _swapc(HEAP32[$0 + 12 >> 2] | 0, $4) | 0; //@line 5552
 $13 = _swapc(HEAP32[$0 + 16 >> 2] | 0, $4) | 0; //@line 5555
 L1 : do {
  if ($7 >>> 0 < $1 >>> 2 >>> 0) {
   $17 = $1 - ($7 << 2) | 0; //@line 5561
   if ($10 >>> 0 < $17 >>> 0 & $13 >>> 0 < $17 >>> 0) {
    if (!(($13 | $10) & 3)) {
     $23 = $10 >>> 2; //@line 5570
     $24 = $13 >>> 2; //@line 5571
     $$090 = 0; //@line 5572
     $$094 = $7; //@line 5572
     while (1) {
      $25 = $$094 >>> 1; //@line 5574
      $26 = $$090 + $25 | 0; //@line 5575
      $27 = $26 << 1; //@line 5576
      $28 = $27 + $23 | 0; //@line 5577
      $31 = _swapc(HEAP32[$0 + ($28 << 2) >> 2] | 0, $4) | 0; //@line 5580
      $35 = _swapc(HEAP32[$0 + ($28 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5584
      if (!($35 >>> 0 < $1 >>> 0 & $31 >>> 0 < ($1 - $35 | 0) >>> 0)) {
       $$4 = 0; //@line 5590
       break L1;
      }
      if (HEAP8[$0 + ($35 + $31) >> 0] | 0) {
       $$4 = 0; //@line 5598
       break L1;
      }
      $44 = _strcmp($2, $0 + $35 | 0) | 0; //@line 5602
      if (!$44) {
       break;
      }
      $63 = ($44 | 0) < 0; //@line 5608
      if (($$094 | 0) == 1) {
       $$4 = 0; //@line 5613
       break L1;
      } else {
       $$090 = $63 ? $$090 : $26; //@line 5616
       $$094 = $63 ? $25 : $$094 - $25 | 0; //@line 5616
      }
     }
     $46 = $27 + $24 | 0; //@line 5619
     $49 = _swapc(HEAP32[$0 + ($46 << 2) >> 2] | 0, $4) | 0; //@line 5622
     $53 = _swapc(HEAP32[$0 + ($46 + 1 << 2) >> 2] | 0, $4) | 0; //@line 5626
     if ($53 >>> 0 < $1 >>> 0 & $49 >>> 0 < ($1 - $53 | 0) >>> 0) {
      $$4 = (HEAP8[$0 + ($53 + $49) >> 0] | 0) == 0 ? $0 + $53 | 0 : 0; //@line 5638
     } else {
      $$4 = 0; //@line 5640
     }
    } else {
     $$4 = 0; //@line 5643
    }
   } else {
    $$4 = 0; //@line 5646
   }
  } else {
   $$4 = 0; //@line 5649
  }
 } while (0);
 return $$4 | 0; //@line 5652
}
function _putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $13 = 0, $14 = 0, $19 = 0, $20 = 0, $21 = 0, $26 = 0, $27 = 0, $32 = 0, $34 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5211
 if ((HEAP32[$1 + 76 >> 2] | 0) < 0) {
  label = 3; //@line 5216
 } else {
  if (!(___lockfile($1) | 0)) {
   label = 3; //@line 5221
  } else {
   $20 = $0 & 255; //@line 5223
   $21 = $0 & 255; //@line 5224
   if (($21 | 0) == (HEAP8[$1 + 75 >> 0] | 0)) {
    label = 12; //@line 5230
   } else {
    $26 = $1 + 20 | 0; //@line 5232
    $27 = HEAP32[$26 >> 2] | 0; //@line 5233
    if ($27 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$26 >> 2] = $27 + 1; //@line 5239
     HEAP8[$27 >> 0] = $20; //@line 5240
     $34 = $21; //@line 5241
    } else {
     label = 12; //@line 5243
    }
   }
   do {
    if ((label | 0) == 12) {
     $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5248
     $32 = ___overflow($1, $0) | 0; //@line 5249
     if (___async) {
      HEAP32[$AsyncCtx >> 2] = 50; //@line 5252
      HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5254
      sp = STACKTOP; //@line 5255
      return 0; //@line 5256
     } else {
      _emscripten_free_async_context($AsyncCtx | 0); //@line 5258
      $34 = $32; //@line 5259
      break;
     }
    }
   } while (0);
   ___unlockfile($1); //@line 5264
   $$0 = $34; //@line 5265
  }
 }
 do {
  if ((label | 0) == 3) {
   $7 = $0 & 255; //@line 5270
   $8 = $0 & 255; //@line 5271
   if (($8 | 0) != (HEAP8[$1 + 75 >> 0] | 0)) {
    $13 = $1 + 20 | 0; //@line 5277
    $14 = HEAP32[$13 >> 2] | 0; //@line 5278
    if ($14 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$13 >> 2] = $14 + 1; //@line 5284
     HEAP8[$14 >> 0] = $7; //@line 5285
     $$0 = $8; //@line 5286
     break;
    }
   }
   $AsyncCtx3 = _emscripten_alloc_async_context(4, sp) | 0; //@line 5290
   $19 = ___overflow($1, $0) | 0; //@line 5291
   if (___async) {
    HEAP32[$AsyncCtx3 >> 2] = 49; //@line 5294
    sp = STACKTOP; //@line 5295
    return 0; //@line 5296
   } else {
    _emscripten_free_async_context($AsyncCtx3 | 0); //@line 5298
    $$0 = $19; //@line 5299
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 5304
}
function ___fflush_unlocked($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $22 = 0, $3 = 0, $7 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5931
 $1 = $0 + 20 | 0; //@line 5932
 $3 = $0 + 28 | 0; //@line 5934
 do {
  if ((HEAP32[$1 >> 2] | 0) >>> 0 > (HEAP32[$3 >> 2] | 0) >>> 0) {
   $7 = HEAP32[$0 + 36 >> 2] | 0; //@line 5940
   $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 5941
   FUNCTION_TABLE_iiii[$7 & 7]($0, 0, 0) | 0; //@line 5942
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 56; //@line 5945
    HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 5947
    HEAP32[$AsyncCtx + 8 >> 2] = $0; //@line 5949
    HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 5951
    sp = STACKTOP; //@line 5952
    return 0; //@line 5953
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 5955
    if (!(HEAP32[$1 >> 2] | 0)) {
     $$0 = -1; //@line 5959
     break;
    } else {
     label = 5; //@line 5962
     break;
    }
   }
  } else {
   label = 5; //@line 5967
  }
 } while (0);
 if ((label | 0) == 5) {
  $13 = $0 + 4 | 0; //@line 5971
  $14 = HEAP32[$13 >> 2] | 0; //@line 5972
  $15 = $0 + 8 | 0; //@line 5973
  $16 = HEAP32[$15 >> 2] | 0; //@line 5974
  do {
   if ($14 >>> 0 < $16 >>> 0) {
    $22 = HEAP32[$0 + 40 >> 2] | 0; //@line 5982
    $AsyncCtx3 = _emscripten_alloc_async_context(24, sp) | 0; //@line 5983
    FUNCTION_TABLE_iiii[$22 & 7]($0, $14 - $16 | 0, 1) | 0; //@line 5984
    if (___async) {
     HEAP32[$AsyncCtx3 >> 2] = 57; //@line 5987
     HEAP32[$AsyncCtx3 + 4 >> 2] = $0; //@line 5989
     HEAP32[$AsyncCtx3 + 8 >> 2] = $3; //@line 5991
     HEAP32[$AsyncCtx3 + 12 >> 2] = $1; //@line 5993
     HEAP32[$AsyncCtx3 + 16 >> 2] = $15; //@line 5995
     HEAP32[$AsyncCtx3 + 20 >> 2] = $13; //@line 5997
     sp = STACKTOP; //@line 5998
     return 0; //@line 5999
    } else {
     _emscripten_free_async_context($AsyncCtx3 | 0); //@line 6001
     break;
    }
   }
  } while (0);
  HEAP32[$0 + 16 >> 2] = 0; //@line 6007
  HEAP32[$3 >> 2] = 0; //@line 6008
  HEAP32[$1 >> 2] = 0; //@line 6009
  HEAP32[$15 >> 2] = 0; //@line 6010
  HEAP32[$13 >> 2] = 0; //@line 6011
  $$0 = 0; //@line 6012
 }
 return $$0 | 0; //@line 6014
}
function __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $12 = 0, $15 = 0, $6 = 0, $7 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer4 = 0, $vararg_buffer8 = 0, sp = 0;
 sp = STACKTOP; //@line 68
 STACKTOP = STACKTOP + 48 | 0; //@line 69
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 69
 $vararg_buffer12 = sp + 32 | 0; //@line 70
 $vararg_buffer8 = sp + 24 | 0; //@line 71
 $vararg_buffer4 = sp + 16 | 0; //@line 72
 $vararg_buffer = sp; //@line 73
 $6 = $4 & 255; //@line 74
 $7 = $5 & 255; //@line 75
 HEAP32[$vararg_buffer >> 2] = $2; //@line 76
 HEAP32[$vararg_buffer + 4 >> 2] = $3; //@line 78
 HEAP32[$vararg_buffer + 8 >> 2] = $6; //@line 80
 HEAP32[$vararg_buffer + 12 >> 2] = $7; //@line 82
 _mbed_tracef(16, 763, 768, $vararg_buffer); //@line 83
 $9 = HEAP32[$0 + 752 >> 2] | 0; //@line 85
 if (($9 | 0) != ($6 | 0)) {
  HEAP32[$vararg_buffer4 >> 2] = $9; //@line 88
  HEAP32[$vararg_buffer4 + 4 >> 2] = $6; //@line 90
  _mbed_tracef(16, 763, 809, $vararg_buffer4); //@line 91
  STACKTOP = sp; //@line 92
  return;
 }
 $12 = HEAP32[$0 + 756 >> 2] | 0; //@line 95
 if (($12 | 0) != ($7 | 0)) {
  HEAP32[$vararg_buffer8 >> 2] = $12; //@line 98
  HEAP32[$vararg_buffer8 + 4 >> 2] = $7; //@line 100
  _mbed_tracef(16, 763, 856, $vararg_buffer8); //@line 101
  STACKTOP = sp; //@line 102
  return;
 }
 $15 = HEAP32[$0 + 692 >> 2] | 0; //@line 105
 if (($15 | 0) == ($3 | 0)) {
  _memcpy($0 + 792 | 0, $1 | 0, $2 | 0) | 0; //@line 109
  HEAP8[$0 + 782 >> 0] = $2; //@line 112
  HEAP8[$0 + 781 >> 0] = -35; //@line 114
  HEAP8[$0 + 780 >> 0] = -5; //@line 116
  HEAP8[$0 + 783 >> 0] = 1; //@line 118
  HEAP32[$0 + 784 >> 2] = _emscripten_asm_const_i(0) | 0; //@line 121
  STACKTOP = sp; //@line 122
  return;
 } else {
  HEAP32[$vararg_buffer12 >> 2] = $15; //@line 124
  HEAP32[$vararg_buffer12 + 4 >> 2] = $3; //@line 126
  _mbed_tracef(16, 763, 903, $vararg_buffer12); //@line 127
  STACKTOP = sp; //@line 128
  return;
 }
}
function ___strchrnul($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $13 = 0, $17 = 0, $18 = 0, $2 = 0, $24 = 0, $25 = 0, $31 = 0, $38 = 0, $39 = 0, $7 = 0;
 $2 = $1 & 255; //@line 5695
 L1 : do {
  if (!$2) {
   $$0 = $0 + (_strlen($0) | 0) | 0; //@line 5701
  } else {
   if (!($0 & 3)) {
    $$030$lcssa = $0; //@line 5707
   } else {
    $7 = $1 & 255; //@line 5709
    $$03039 = $0; //@line 5710
    while (1) {
     $10 = HEAP8[$$03039 >> 0] | 0; //@line 5712
     if ($10 << 24 >> 24 == 0 ? 1 : $10 << 24 >> 24 == $7 << 24 >> 24) {
      $$0 = $$03039; //@line 5717
      break L1;
     }
     $13 = $$03039 + 1 | 0; //@line 5720
     if (!($13 & 3)) {
      $$030$lcssa = $13; //@line 5725
      break;
     } else {
      $$03039 = $13; //@line 5728
     }
    }
   }
   $17 = Math_imul($2, 16843009) | 0; //@line 5732
   $18 = HEAP32[$$030$lcssa >> 2] | 0; //@line 5733
   L10 : do {
    if (!(($18 & -2139062144 ^ -2139062144) & $18 + -16843009)) {
     $$02936 = $$030$lcssa; //@line 5741
     $25 = $18; //@line 5741
     while (1) {
      $24 = $25 ^ $17; //@line 5743
      if (($24 & -2139062144 ^ -2139062144) & $24 + -16843009 | 0) {
       $$029$lcssa = $$02936; //@line 5750
       break L10;
      }
      $31 = $$02936 + 4 | 0; //@line 5753
      $25 = HEAP32[$31 >> 2] | 0; //@line 5754
      if (($25 & -2139062144 ^ -2139062144) & $25 + -16843009 | 0) {
       $$029$lcssa = $31; //@line 5763
       break;
      } else {
       $$02936 = $31; //@line 5761
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa; //@line 5768
    }
   } while (0);
   $38 = $1 & 255; //@line 5771
   $$1 = $$029$lcssa; //@line 5772
   while (1) {
    $39 = HEAP8[$$1 >> 0] | 0; //@line 5774
    if ($39 << 24 >> 24 == 0 ? 1 : $39 << 24 >> 24 == $38 << 24 >> 24) {
     $$0 = $$1; //@line 5780
     break;
    } else {
     $$1 = $$1 + 1 | 0; //@line 5783
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 5788
}
function _mbed_trace_init() {
 var $$0 = 0, $0 = 0, $10 = 0, $13 = 0, $14 = 0, $17 = 0, $19 = 0, $22 = 0, $24 = 0, $3 = 0, $4 = 0, $7 = 0, $9 = 0;
 $0 = HEAP32[28] | 0; //@line 136
 if (!$0) {
  $3 = _malloc(HEAP32[29] | 0) | 0; //@line 140
  HEAP32[28] = $3; //@line 141
  $19 = $3; //@line 142
 } else {
  $19 = $0; //@line 144
 }
 $4 = HEAP32[30] | 0; //@line 146
 if (!$4) {
  $7 = _malloc(HEAP32[31] | 0) | 0; //@line 150
  HEAP32[30] = $7; //@line 151
  $9 = $7; //@line 152
 } else {
  $9 = $4; //@line 154
 }
 HEAP32[32] = $9; //@line 157
 $10 = HEAP32[25] | 0; //@line 158
 if (!$10) {
  $13 = _malloc(HEAP32[27] | 0) | 0; //@line 162
  HEAP32[25] = $13; //@line 163
  $22 = $13; //@line 164
 } else {
  $22 = $10; //@line 166
 }
 $14 = HEAP32[26] | 0; //@line 168
 if (!$14) {
  $17 = _malloc(HEAP32[27] | 0) | 0; //@line 172
  HEAP32[26] = $17; //@line 173
  $24 = $17; //@line 174
 } else {
  $24 = $14; //@line 176
 }
 if (($19 | 0) == 0 | ($9 | 0) == 0 | ($22 | 0) == 0 | ($24 | 0) == 0) {
  _free($19); //@line 186
  _free(HEAP32[30] | 0); //@line 188
  _free(HEAP32[25] | 0); //@line 190
  _free(HEAP32[26] | 0); //@line 192
  HEAP8[96] = 127; //@line 193
  HEAP32[25] = 0; //@line 194
  HEAP32[26] = 0; //@line 195
  HEAP32[27] = 24; //@line 196
  HEAP32[28] = 0; //@line 197
  HEAP32[29] = 1024; //@line 198
  HEAP32[30] = 0; //@line 199
  HEAP32[31] = 128; //@line 200
  HEAP32[33] = 0; //@line 201
  HEAP32[34] = 0; //@line 202
  HEAP32[35] = 1; //@line 203
  HEAP32[36] = 0; //@line 204
  HEAP32[37] = 0; //@line 204
  HEAP32[38] = 0; //@line 204
  HEAP32[39] = 0; //@line 204
  $$0 = -1; //@line 205
  return $$0 | 0; //@line 206
 } else {
  _memset($9 | 0, 0, HEAP32[31] | 0) | 0; //@line 209
  _memset(HEAP32[25] | 0, 0, HEAP32[27] | 0) | 0; //@line 212
  _memset(HEAP32[26] | 0, 0, HEAP32[27] | 0) | 0; //@line 215
  _memset(HEAP32[28] | 0, 0, HEAP32[29] | 0) | 0; //@line 218
  $$0 = 0; //@line 219
  return $$0 | 0; //@line 220
 }
 return 0; //@line 222
}
function _mbed_trace_array__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$042$ph = 0, $$04353 = 0, $$04552 = 0, $$04651 = 0, $$04750 = 0, $$2$ph = 0, $12 = 0, $16 = 0, $17 = 0, $2 = 0, $25 = 0, $28 = 0, $34 = 0, $4 = 0, $6 = 0;
 $2 = HEAP16[$0 + 4 >> 1] | 0; //@line 11099
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11101
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11103
 HEAP32[39] = (HEAP32[39] | 0) + 1; //@line 11108
 $12 = HEAP32[32] | 0; //@line 11110
 $16 = (HEAP32[30] | 0) - $12 + (HEAP32[31] | 0) | 0; //@line 11114
 $17 = $2 & 65535; //@line 11115
 if ($2 << 16 >> 16 == 0 | ($12 | 0) == 0 | ($16 | 0) == 0) {
  $$0 = 4596; //@line 11122
  $34 = ___async_retval; //@line 11123
  HEAP32[$34 >> 2] = $$0; //@line 11124
  return;
 }
 if (!$4) {
  $$0 = 1067; //@line 11129
  $34 = ___async_retval; //@line 11130
  HEAP32[$34 >> 2] = $$0; //@line 11131
  return;
 }
 HEAP8[$12 >> 0] = 0; //@line 11134
 $$04353 = $4; //@line 11135
 $$04552 = $12; //@line 11135
 $$04651 = 0; //@line 11135
 $$04750 = $16; //@line 11135
 while (1) {
  if (($$04750 | 0) < 4) {
   $$042$ph = 42; //@line 11139
   $$2$ph = $$04552; //@line 11139
   break;
  }
  HEAP32[$6 >> 2] = HEAPU8[$$04353 >> 0]; //@line 11144
  $25 = _snprintf($$04552, $$04750, 1074, $6) | 0; //@line 11145
  $28 = $$04552 + $25 | 0; //@line 11149
  if (($25 | 0) < 1 | ($$04750 | 0) < ($25 | 0)) {
   $$042$ph = 0; //@line 11151
   $$2$ph = $$04552; //@line 11151
   break;
  }
  $$04651 = $$04651 + 1 | 0; //@line 11156
  if (($$04651 | 0) >= ($17 | 0)) {
   $$042$ph = 0; //@line 11161
   $$2$ph = $28; //@line 11161
   break;
  } else {
   $$04353 = $$04353 + 1 | 0; //@line 11159
   $$04552 = $28; //@line 11159
   $$04750 = $$04750 - $25 | 0; //@line 11159
  }
 }
 if ($$2$ph >>> 0 > $12 >>> 0) {
  HEAP8[$$2$ph + -1 >> 0] = $$042$ph; //@line 11168
 }
 HEAP32[32] = $$2$ph; //@line 11170
 $$0 = $12; //@line 11171
 $34 = ___async_retval; //@line 11172
 HEAP32[$34 >> 2] = $$0; //@line 11173
 return;
}
function ___fwritex($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$038 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $10 = 0, $12 = 0, $14 = 0, $22 = 0, $28 = 0, $3 = 0, $31 = 0, $4 = 0, $9 = 0, label = 0;
 $3 = $2 + 16 | 0; //@line 5437
 $4 = HEAP32[$3 >> 2] | 0; //@line 5438
 if (!$4) {
  if (!(___towrite($2) | 0)) {
   $12 = HEAP32[$3 >> 2] | 0; //@line 5445
   label = 5; //@line 5446
  } else {
   $$1 = 0; //@line 5448
  }
 } else {
  $12 = $4; //@line 5452
  label = 5; //@line 5453
 }
 L5 : do {
  if ((label | 0) == 5) {
   $9 = $2 + 20 | 0; //@line 5457
   $10 = HEAP32[$9 >> 2] | 0; //@line 5458
   $14 = $10; //@line 5461
   if (($12 - $10 | 0) >>> 0 < $1 >>> 0) {
    $$1 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $1) | 0; //@line 5466
    break;
   }
   L10 : do {
    if ((HEAP8[$2 + 75 >> 0] | 0) > -1) {
     $$038 = $1; //@line 5474
     while (1) {
      if (!$$038) {
       $$139 = 0; //@line 5478
       $$141 = $0; //@line 5478
       $$143 = $1; //@line 5478
       $31 = $14; //@line 5478
       break L10;
      }
      $22 = $$038 + -1 | 0; //@line 5481
      if ((HEAP8[$0 + $22 >> 0] | 0) == 10) {
       break;
      } else {
       $$038 = $22; //@line 5488
      }
     }
     $28 = FUNCTION_TABLE_iiii[HEAP32[$2 + 36 >> 2] & 7]($2, $0, $$038) | 0; //@line 5493
     if ($28 >>> 0 < $$038 >>> 0) {
      $$1 = $28; //@line 5496
      break L5;
     }
     $$139 = $$038; //@line 5502
     $$141 = $0 + $$038 | 0; //@line 5502
     $$143 = $1 - $$038 | 0; //@line 5502
     $31 = HEAP32[$9 >> 2] | 0; //@line 5502
    } else {
     $$139 = 0; //@line 5504
     $$141 = $0; //@line 5504
     $$143 = $1; //@line 5504
     $31 = $14; //@line 5504
    }
   } while (0);
   _memcpy($31 | 0, $$141 | 0, $$143 | 0) | 0; //@line 5507
   HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + $$143; //@line 5510
   $$1 = $$139 + $$143 | 0; //@line 5512
  }
 } while (0);
 return $$1 | 0; //@line 5515
}
function ___overflow($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $10 = 0, $12 = 0, $13 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $9 = 0, $AsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 5323
 STACKTOP = STACKTOP + 16 | 0; //@line 5324
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 5324
 $2 = sp; //@line 5325
 $3 = $1 & 255; //@line 5326
 HEAP8[$2 >> 0] = $3; //@line 5327
 $4 = $0 + 16 | 0; //@line 5328
 $5 = HEAP32[$4 >> 2] | 0; //@line 5329
 if (!$5) {
  if (!(___towrite($0) | 0)) {
   $12 = HEAP32[$4 >> 2] | 0; //@line 5336
   label = 4; //@line 5337
  } else {
   $$0 = -1; //@line 5339
  }
 } else {
  $12 = $5; //@line 5342
  label = 4; //@line 5343
 }
 do {
  if ((label | 0) == 4) {
   $9 = $0 + 20 | 0; //@line 5347
   $10 = HEAP32[$9 >> 2] | 0; //@line 5348
   if ($10 >>> 0 < $12 >>> 0) {
    $13 = $1 & 255; //@line 5351
    if (($13 | 0) != (HEAP8[$0 + 75 >> 0] | 0)) {
     HEAP32[$9 >> 2] = $10 + 1; //@line 5358
     HEAP8[$10 >> 0] = $3; //@line 5359
     $$0 = $13; //@line 5360
     break;
    }
   }
   $20 = HEAP32[$0 + 36 >> 2] | 0; //@line 5365
   $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 5366
   $21 = FUNCTION_TABLE_iiii[$20 & 7]($0, $2, 1) | 0; //@line 5367
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 51; //@line 5370
    HEAP32[$AsyncCtx + 4 >> 2] = $2; //@line 5372
    sp = STACKTOP; //@line 5373
    STACKTOP = sp; //@line 5374
    return 0; //@line 5374
   }
   _emscripten_free_async_context($AsyncCtx | 0); //@line 5376
   if (($21 | 0) == 1) {
    $$0 = HEAPU8[$2 >> 0] | 0; //@line 5381
   } else {
    $$0 = -1; //@line 5383
   }
  }
 } while (0);
 STACKTOP = sp; //@line 5387
 return $$0 | 0; //@line 5387
}
function _fflush__async_cb_38($0) {
 $0 = $0 | 0;
 var $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $13 = 0, $16 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 13087
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13089
 $$02325 = HEAP32[(___ofl_lock() | 0) >> 2] | 0; //@line 13091
 L3 : do {
  if (!$$02325) {
   $$024$lcssa = $AsyncRetVal; //@line 13095
  } else {
   $$02327 = $$02325; //@line 13097
   $$02426 = $AsyncRetVal; //@line 13097
   while (1) {
    if ((HEAP32[$$02327 + 76 >> 2] | 0) > -1) {
     $16 = ___lockfile($$02327) | 0; //@line 13104
    } else {
     $16 = 0; //@line 13106
    }
    if ((HEAP32[$$02327 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327 + 28 >> 2] | 0) >>> 0) {
     break;
    }
    if ($16 | 0) {
     ___unlockfile($$02327); //@line 13118
    }
    $$023 = HEAP32[$$02327 + 56 >> 2] | 0; //@line 13121
    if (!$$023) {
     $$024$lcssa = $$02426; //@line 13124
     break L3;
    } else {
     $$02327 = $$023; //@line 13127
    }
   }
   $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13130
   $13 = ___fflush_unlocked($$02327) | 0; //@line 13131
   if (!___async) {
    HEAP32[___async_retval >> 2] = $13; //@line 13135
    ___async_unwind = 0; //@line 13136
   }
   HEAP32[$ReallocAsyncCtx >> 2] = 55; //@line 13138
   HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$02426; //@line 13140
   HEAP32[$ReallocAsyncCtx + 8 >> 2] = $16; //@line 13142
   HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327; //@line 13144
   sp = STACKTOP; //@line 13145
   return;
  }
 } while (0);
 ___ofl_unlock(); //@line 13149
 HEAP32[___async_retval >> 2] = $$024$lcssa; //@line 13151
 return;
}
function _memset(ptr, value, num) {
 ptr = ptr | 0;
 value = value | 0;
 num = num | 0;
 var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
 end = ptr + num | 0; //@line 13565
 value = value & 255; //@line 13567
 if ((num | 0) >= 67) {
  while (ptr & 3) {
   HEAP8[ptr >> 0] = value; //@line 13570
   ptr = ptr + 1 | 0; //@line 13571
  }
  aligned_end = end & -4 | 0; //@line 13574
  block_aligned_end = aligned_end - 64 | 0; //@line 13575
  value4 = value | value << 8 | value << 16 | value << 24; //@line 13576
  while ((ptr | 0) <= (block_aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 13579
   HEAP32[ptr + 4 >> 2] = value4; //@line 13580
   HEAP32[ptr + 8 >> 2] = value4; //@line 13581
   HEAP32[ptr + 12 >> 2] = value4; //@line 13582
   HEAP32[ptr + 16 >> 2] = value4; //@line 13583
   HEAP32[ptr + 20 >> 2] = value4; //@line 13584
   HEAP32[ptr + 24 >> 2] = value4; //@line 13585
   HEAP32[ptr + 28 >> 2] = value4; //@line 13586
   HEAP32[ptr + 32 >> 2] = value4; //@line 13587
   HEAP32[ptr + 36 >> 2] = value4; //@line 13588
   HEAP32[ptr + 40 >> 2] = value4; //@line 13589
   HEAP32[ptr + 44 >> 2] = value4; //@line 13590
   HEAP32[ptr + 48 >> 2] = value4; //@line 13591
   HEAP32[ptr + 52 >> 2] = value4; //@line 13592
   HEAP32[ptr + 56 >> 2] = value4; //@line 13593
   HEAP32[ptr + 60 >> 2] = value4; //@line 13594
   ptr = ptr + 64 | 0; //@line 13595
  }
  while ((ptr | 0) < (aligned_end | 0)) {
   HEAP32[ptr >> 2] = value4; //@line 13599
   ptr = ptr + 4 | 0; //@line 13600
  }
 }
 while ((ptr | 0) < (end | 0)) {
  HEAP8[ptr >> 0] = value; //@line 13605
  ptr = ptr + 1 | 0; //@line 13606
 }
 return end - num | 0; //@line 13608
}
function _fflush__async_cb($0) {
 $0 = $0 | 0;
 var $$02327$reg2mem$0 = 0, $$1 = 0, $$reg2mem$0 = 0, $17 = 0, $20 = 0, $ReallocAsyncCtx = 0, label = 0, sp = 0;
 sp = STACKTOP; //@line 12988
 $$02327$reg2mem$0 = HEAP32[$0 + 12 >> 2] | 0; //@line 12998
 $$1 = HEAP32[___async_retval >> 2] | HEAP32[$0 + 4 >> 2]; //@line 12998
 $$reg2mem$0 = HEAP32[$0 + 8 >> 2] | 0; //@line 12998
 while (1) {
  if ($$reg2mem$0 | 0) {
   ___unlockfile($$02327$reg2mem$0); //@line 13002
  }
  $$02327$reg2mem$0 = HEAP32[$$02327$reg2mem$0 + 56 >> 2] | 0; //@line 13005
  if (!$$02327$reg2mem$0) {
   label = 12; //@line 13008
   break;
  }
  if ((HEAP32[$$02327$reg2mem$0 + 76 >> 2] | 0) > -1) {
   $20 = ___lockfile($$02327$reg2mem$0) | 0; //@line 13016
  } else {
   $20 = 0; //@line 13018
  }
  if ((HEAP32[$$02327$reg2mem$0 + 20 >> 2] | 0) >>> 0 > (HEAP32[$$02327$reg2mem$0 + 28 >> 2] | 0) >>> 0) {
   break;
  } else {
   $$reg2mem$0 = $20; //@line 13028
  }
 }
 if ((label | 0) == 12) {
  ___ofl_unlock(); //@line 13032
  HEAP32[___async_retval >> 2] = $$1; //@line 13034
  return;
 }
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 13037
 $17 = ___fflush_unlocked($$02327$reg2mem$0) | 0; //@line 13038
 if (!___async) {
  HEAP32[___async_retval >> 2] = $17; //@line 13042
  ___async_unwind = 0; //@line 13043
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 55; //@line 13045
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $$1; //@line 13047
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $20; //@line 13049
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $$02327$reg2mem$0; //@line 13051
 sp = STACKTOP; //@line 13052
 return;
}
function ___fflush_unlocked__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $18 = 0, $2 = 0, $4 = 0, $6 = 0, $9 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11248
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11250
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11252
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11254
 do {
  if (!(HEAP32[$2 >> 2] | 0)) {
   $$0 = -1; //@line 11259
  } else {
   $9 = $4 + 4 | 0; //@line 11261
   $10 = HEAP32[$9 >> 2] | 0; //@line 11262
   $11 = $4 + 8 | 0; //@line 11263
   $12 = HEAP32[$11 >> 2] | 0; //@line 11264
   if ($10 >>> 0 >= $12 >>> 0) {
    HEAP32[$4 + 16 >> 2] = 0; //@line 11268
    HEAP32[$6 >> 2] = 0; //@line 11269
    HEAP32[$2 >> 2] = 0; //@line 11270
    HEAP32[$11 >> 2] = 0; //@line 11271
    HEAP32[$9 >> 2] = 0; //@line 11272
    $$0 = 0; //@line 11273
    break;
   }
   $18 = HEAP32[$4 + 40 >> 2] | 0; //@line 11280
   $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 11281
   FUNCTION_TABLE_iiii[$18 & 7]($4, $10 - $12 | 0, 1) | 0; //@line 11282
   if (!___async) {
    ___async_unwind = 0; //@line 11285
   }
   HEAP32[$ReallocAsyncCtx2 >> 2] = 57; //@line 11287
   HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 11289
   HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 11291
   HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $2; //@line 11293
   HEAP32[$ReallocAsyncCtx2 + 16 >> 2] = $11; //@line 11295
   HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $9; //@line 11297
   sp = STACKTOP; //@line 11298
   return;
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 11303
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_20($0) {
 $0 = $0 | 0;
 var $15 = 0, $16 = 0, $2 = 0, $4 = 0, $6 = 0, $AsyncRetVal = 0, $ReallocAsyncCtx = 0, dest = 0, sp = 0, stop = 0;
 sp = STACKTOP; //@line 11360
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11362
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11364
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11366
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11368
 if (!$AsyncRetVal) {
  HEAP8[___async_retval >> 0] = 0; //@line 11373
  return;
 }
 dest = $2 + 4 | 0; //@line 11377
 stop = dest + 52 | 0; //@line 11377
 do {
  HEAP32[dest >> 2] = 0; //@line 11377
  dest = dest + 4 | 0; //@line 11377
 } while ((dest | 0) < (stop | 0));
 HEAP32[$2 >> 2] = $AsyncRetVal; //@line 11378
 HEAP32[$2 + 8 >> 2] = $4; //@line 11380
 HEAP32[$2 + 12 >> 2] = -1; //@line 11382
 HEAP32[$2 + 48 >> 2] = 1; //@line 11384
 $15 = HEAP32[(HEAP32[$AsyncRetVal >> 2] | 0) + 28 >> 2] | 0; //@line 11387
 $16 = HEAP32[$6 >> 2] | 0; //@line 11388
 $ReallocAsyncCtx = _emscripten_realloc_async_context(16) | 0; //@line 11389
 FUNCTION_TABLE_viiii[$15 & 3]($AsyncRetVal, $2, $16, 1); //@line 11390
 if (!___async) {
  ___async_unwind = 0; //@line 11393
 }
 HEAP32[$ReallocAsyncCtx >> 2] = 63; //@line 11395
 HEAP32[$ReallocAsyncCtx + 4 >> 2] = $2; //@line 11397
 HEAP32[$ReallocAsyncCtx + 8 >> 2] = $6; //@line 11399
 HEAP32[$ReallocAsyncCtx + 12 >> 2] = $2; //@line 11401
 sp = STACKTOP; //@line 11402
 return;
}
function _wcrtomb($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0 = 0;
 do {
  if (!$0) {
   $$0 = 1; //@line 8703
  } else {
   if ($1 >>> 0 < 128) {
    HEAP8[$0 >> 0] = $1; //@line 8708
    $$0 = 1; //@line 8709
    break;
   }
   if (!(HEAP32[HEAP32[(___pthread_self_910() | 0) + 188 >> 2] >> 2] | 0)) {
    if (($1 & -128 | 0) == 57216) {
     HEAP8[$0 >> 0] = $1; //@line 8722
     $$0 = 1; //@line 8723
     break;
    } else {
     HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8727
     $$0 = -1; //@line 8728
     break;
    }
   }
   if ($1 >>> 0 < 2048) {
    HEAP8[$0 >> 0] = $1 >>> 6 | 192; //@line 8738
    HEAP8[$0 + 1 >> 0] = $1 & 63 | 128; //@line 8742
    $$0 = 2; //@line 8743
    break;
   }
   if ($1 >>> 0 < 55296 | ($1 & -8192 | 0) == 57344) {
    HEAP8[$0 >> 0] = $1 >>> 12 | 224; //@line 8755
    HEAP8[$0 + 1 >> 0] = $1 >>> 6 & 63 | 128; //@line 8761
    HEAP8[$0 + 2 >> 0] = $1 & 63 | 128; //@line 8765
    $$0 = 3; //@line 8766
    break;
   }
   if (($1 + -65536 | 0) >>> 0 < 1048576) {
    HEAP8[$0 >> 0] = $1 >>> 18 | 240; //@line 8776
    HEAP8[$0 + 1 >> 0] = $1 >>> 12 & 63 | 128; //@line 8782
    HEAP8[$0 + 2 >> 0] = $1 >>> 6 & 63 | 128; //@line 8788
    HEAP8[$0 + 3 >> 0] = $1 & 63 | 128; //@line 8792
    $$0 = 4; //@line 8793
    break;
   } else {
    HEAP32[(___errno_location() | 0) >> 2] = 84; //@line 8797
    $$0 = -1; //@line 8798
    break;
   }
  }
 } while (0);
 return $$0 | 0; //@line 8803
}
function _fmt_u($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $26 = 0, $8 = 0, $9 = 0, $8$looptemp = 0;
 if ($1 >>> 0 > 0 | ($1 | 0) == 0 & $0 >>> 0 > 4294967295) {
  $$0914 = $2; //@line 7587
  $8 = $0; //@line 7587
  $9 = $1; //@line 7587
  while (1) {
   $10 = ___uremdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7589
   $$0914 = $$0914 + -1 | 0; //@line 7593
   HEAP8[$$0914 >> 0] = $10 & 255 | 48; //@line 7594
   $8$looptemp = $8;
   $8 = ___udivdi3($8 | 0, $9 | 0, 10, 0) | 0; //@line 7595
   if (!($9 >>> 0 > 9 | ($9 | 0) == 9 & $8$looptemp >>> 0 > 4294967295)) {
    break;
   } else {
    $9 = tempRet0; //@line 7603
   }
  }
  $$010$lcssa$off0 = $8; //@line 7608
  $$09$lcssa = $$0914; //@line 7608
 } else {
  $$010$lcssa$off0 = $0; //@line 7610
  $$09$lcssa = $2; //@line 7610
 }
 if (!$$010$lcssa$off0) {
  $$1$lcssa = $$09$lcssa; //@line 7614
 } else {
  $$012 = $$010$lcssa$off0; //@line 7616
  $$111 = $$09$lcssa; //@line 7616
  while (1) {
   $26 = $$111 + -1 | 0; //@line 7621
   HEAP8[$26 >> 0] = ($$012 >>> 0) % 10 | 0 | 48; //@line 7622
   if ($$012 >>> 0 < 10) {
    $$1$lcssa = $26; //@line 7626
    break;
   } else {
    $$012 = ($$012 >>> 0) / 10 | 0; //@line 7629
    $$111 = $26; //@line 7629
   }
  }
 }
 return $$1$lcssa | 0; //@line 7633
}
function _strlen($0) {
 $0 = $0 | 0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$sink = 0, $1 = 0, $10 = 0, $19 = 0, $23 = 0, $6 = 0, label = 0;
 $1 = $0; //@line 5089
 L1 : do {
  if (!($1 & 3)) {
   $$015$lcssa = $0; //@line 5094
   label = 4; //@line 5095
  } else {
   $$01519 = $0; //@line 5097
   $23 = $1; //@line 5097
   while (1) {
    if (!(HEAP8[$$01519 >> 0] | 0)) {
     $$sink = $23; //@line 5102
     break L1;
    }
    $6 = $$01519 + 1 | 0; //@line 5105
    $23 = $6; //@line 5106
    if (!($23 & 3)) {
     $$015$lcssa = $6; //@line 5110
     label = 4; //@line 5111
     break;
    } else {
     $$01519 = $6; //@line 5114
    }
   }
  }
 } while (0);
 if ((label | 0) == 4) {
  $$0 = $$015$lcssa; //@line 5120
  while (1) {
   $10 = HEAP32[$$0 >> 2] | 0; //@line 5122
   if (!(($10 & -2139062144 ^ -2139062144) & $10 + -16843009)) {
    $$0 = $$0 + 4 | 0; //@line 5130
   } else {
    break;
   }
  }
  if (!(($10 & 255) << 24 >> 24)) {
   $$1$lcssa = $$0; //@line 5138
  } else {
   $$pn = $$0; //@line 5140
   while (1) {
    $19 = $$pn + 1 | 0; //@line 5142
    if (!(HEAP8[$19 >> 0] | 0)) {
     $$1$lcssa = $19; //@line 5146
     break;
    } else {
     $$pn = $19; //@line 5149
    }
   }
  }
  $$sink = $$1$lcssa; //@line 5154
 }
 return $$sink - $1 | 0; //@line 5157
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $10 = 0, $11 = 0, $21 = 0, $22 = 0, $28 = 0, $30 = 0;
 HEAP8[$1 + 53 >> 0] = 1; //@line 9997
 do {
  if ((HEAP32[$1 + 4 >> 2] | 0) == ($3 | 0)) {
   HEAP8[$1 + 52 >> 0] = 1; //@line 10004
   $10 = $1 + 16 | 0; //@line 10005
   $11 = HEAP32[$10 >> 2] | 0; //@line 10006
   if (!$11) {
    HEAP32[$10 >> 2] = $2; //@line 10009
    HEAP32[$1 + 24 >> 2] = $4; //@line 10011
    HEAP32[$1 + 36 >> 2] = 1; //@line 10013
    if (!(($4 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0)) {
     break;
    }
    HEAP8[$1 + 54 >> 0] = 1; //@line 10023
    break;
   }
   if (($11 | 0) != ($2 | 0)) {
    $30 = $1 + 36 | 0; //@line 10028
    HEAP32[$30 >> 2] = (HEAP32[$30 >> 2] | 0) + 1; //@line 10031
    HEAP8[$1 + 54 >> 0] = 1; //@line 10033
    break;
   }
   $21 = $1 + 24 | 0; //@line 10036
   $22 = HEAP32[$21 >> 2] | 0; //@line 10037
   if (($22 | 0) == 2) {
    HEAP32[$21 >> 2] = $4; //@line 10040
    $28 = $4; //@line 10041
   } else {
    $28 = $22; //@line 10043
   }
   if (($28 | 0) == 1 ? (HEAP32[$1 + 48 >> 2] | 0) == 1 : 0) {
    HEAP8[$1 + 54 >> 0] = 1; //@line 10052
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_28($0) {
 $0 = $0 | 0;
 var $$18 = 0, $10 = 0, $12 = 0, $16 = 0, $19 = 0, $2 = 0, $20 = 0, $23 = 0, $24 = 0, $4 = 0, $6 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 12457
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12459
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12461
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12463
 $10 = HEAP8[$0 + 20 >> 0] & 1; //@line 12468
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 12470
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 12475
 $16 = _snprintf($4, $6, 984, $2) | 0; //@line 12476
 $$18 = ($16 | 0) >= ($6 | 0) ? 0 : $16; //@line 12478
 $19 = $4 + $$18 | 0; //@line 12480
 $20 = $6 - $$18 | 0; //@line 12481
 if (($$18 | 0) > 0) {
  if (!(($$18 | 0) < 1 | ($20 | 0) < 1 | $10 ^ 1)) {
   _snprintf($19, $20, 1062, $12) | 0; //@line 12489
  }
 }
 $23 = HEAP32[35] | 0; //@line 12492
 $24 = HEAP32[28] | 0; //@line 12493
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(4) | 0; //@line 12494
 FUNCTION_TABLE_vi[$23 & 127]($24); //@line 12495
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12498
  sp = STACKTOP; //@line 12499
  return;
 }
 ___async_unwind = 0; //@line 12502
 HEAP32[$ReallocAsyncCtx7 >> 2] = 18; //@line 12503
 sp = STACKTOP; //@line 12504
 return;
}
function _puts($0) {
 $0 = $0 | 0;
 var $1 = 0, $11 = 0, $12 = 0, $17 = 0, $19 = 0, $22 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9652
 $1 = HEAP32[40] | 0; //@line 9653
 if ((HEAP32[$1 + 76 >> 2] | 0) > -1) {
  $19 = ___lockfile($1) | 0; //@line 9659
 } else {
  $19 = 0; //@line 9661
 }
 do {
  if ((_fputs($0, $1) | 0) < 0) {
   $22 = -1; //@line 9667
  } else {
   if ((HEAP8[$1 + 75 >> 0] | 0) != 10) {
    $11 = $1 + 20 | 0; //@line 9673
    $12 = HEAP32[$11 >> 2] | 0; //@line 9674
    if ($12 >>> 0 < (HEAP32[$1 + 16 >> 2] | 0) >>> 0) {
     HEAP32[$11 >> 2] = $12 + 1; //@line 9680
     HEAP8[$12 >> 0] = 10; //@line 9681
     $22 = 0; //@line 9682
     break;
    }
   }
   $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 9686
   $17 = ___overflow($1, 10) | 0; //@line 9687
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 61; //@line 9690
    HEAP32[$AsyncCtx + 4 >> 2] = $19; //@line 9692
    HEAP32[$AsyncCtx + 8 >> 2] = $1; //@line 9694
    sp = STACKTOP; //@line 9695
    return 0; //@line 9696
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 9698
    $22 = $17 >> 31; //@line 9700
    break;
   }
  }
 } while (0);
 if ($19 | 0) {
  ___unlockfile($1); //@line 9707
 }
 return $22 | 0; //@line 9709
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb($0) {
 $0 = $0 | 0;
 var $$037$off038 = 0, $$037$off039 = 0, $12 = 0, $17 = 0, $4 = 0, $6 = 0, $8 = 0, label = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11413
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11415
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11417
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 11421
 if (!(HEAP8[HEAP32[$0 + 4 >> 2] >> 0] | 0)) {
  $$037$off038 = 4; //@line 11425
  label = 4; //@line 11426
 } else {
  if (!(HEAP8[HEAP32[$0 + 20 >> 2] >> 0] | 0)) {
   $$037$off038 = 3; //@line 11431
   label = 4; //@line 11432
  } else {
   $$037$off039 = 3; //@line 11434
  }
 }
 if ((label | 0) == 4) {
  HEAP32[$6 >> 2] = $4; //@line 11438
  $17 = $8 + 40 | 0; //@line 11439
  HEAP32[$17 >> 2] = (HEAP32[$17 >> 2] | 0) + 1; //@line 11442
  if ((HEAP32[$8 + 36 >> 2] | 0) == 1) {
   if ((HEAP32[$8 + 24 >> 2] | 0) == 2) {
    HEAP8[$8 + 54 >> 0] = 1; //@line 11452
    $$037$off039 = $$037$off038; //@line 11453
   } else {
    $$037$off039 = $$037$off038; //@line 11455
   }
  } else {
   $$037$off039 = $$037$off038; //@line 11458
  }
 }
 HEAP32[$12 >> 2] = $$037$off039; //@line 11461
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $13 = 0, $19 = 0;
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $4) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0, $1, $2, $3); //@line 9856
  } else {
   if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 >> 2] | 0, $4) | 0) {
    if ((HEAP32[$1 + 16 >> 2] | 0) != ($2 | 0)) {
     $13 = $1 + 20 | 0; //@line 9865
     if ((HEAP32[$13 >> 2] | 0) != ($2 | 0)) {
      HEAP32[$1 + 32 >> 2] = $3; //@line 9870
      HEAP32[$13 >> 2] = $2; //@line 9871
      $19 = $1 + 40 | 0; //@line 9872
      HEAP32[$19 >> 2] = (HEAP32[$19 >> 2] | 0) + 1; //@line 9875
      if ((HEAP32[$1 + 36 >> 2] | 0) == 1) {
       if ((HEAP32[$1 + 24 >> 2] | 0) == 2) {
        HEAP8[$1 + 54 >> 0] = 1; //@line 9885
       }
      }
      HEAP32[$1 + 44 >> 2] = 4; //@line 9889
      break;
     }
    }
    if (($3 | 0) == 1) {
     HEAP32[$1 + 32 >> 2] = 1; //@line 9896
    }
   }
  }
 } while (0);
 return;
}
function ___strerror_l($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $7 = 0, label = 0, $$113$looptemp = 0;
 $$016 = 0; //@line 8823
 while (1) {
  if ((HEAPU8[1926 + $$016 >> 0] | 0) == ($0 | 0)) {
   label = 2; //@line 8830
   break;
  }
  $7 = $$016 + 1 | 0; //@line 8833
  if (($7 | 0) == 87) {
   $$01214 = 2014; //@line 8836
   $$115 = 87; //@line 8836
   label = 5; //@line 8837
   break;
  } else {
   $$016 = $7; //@line 8840
  }
 }
 if ((label | 0) == 2) {
  if (!$$016) {
   $$012$lcssa = 2014; //@line 8846
  } else {
   $$01214 = 2014; //@line 8848
   $$115 = $$016; //@line 8848
   label = 5; //@line 8849
  }
 }
 if ((label | 0) == 5) {
  while (1) {
   label = 0; //@line 8854
   $$113 = $$01214; //@line 8855
   do {
    $$113$looptemp = $$113;
    $$113 = $$113 + 1 | 0; //@line 8859
   } while ((HEAP8[$$113$looptemp >> 0] | 0) != 0);
   $$115 = $$115 + -1 | 0; //@line 8866
   if (!$$115) {
    $$012$lcssa = $$113; //@line 8869
    break;
   } else {
    $$01214 = $$113; //@line 8872
    label = 5; //@line 8873
   }
  }
 }
 return ___lctrans($$012$lcssa, HEAP32[$1 + 20 >> 2] | 0) | 0; //@line 8880
}
function _main() {
 var $0 = 0, $AsyncCtx = 0, $vararg_buffer7 = 0, sp = 0;
 sp = STACKTOP; //@line 1637
 STACKTOP = STACKTOP + 48 | 0; //@line 1638
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(48); //@line 1638
 $vararg_buffer7 = sp + 32 | 0; //@line 1639
 _mbed_trace_init() | 0; //@line 1644
 _mbed_tracef(16, 1292, 1297, sp); //@line 1645
 _mbed_tracef(8, 1292, 1315, sp + 8 | 0); //@line 1646
 _mbed_tracef(4, 1292, 1332, sp + 16 | 0); //@line 1647
 _mbed_tracef(2, 1292, 1352, sp + 24 | 0); //@line 1648
 $AsyncCtx = _emscripten_alloc_async_context(12, sp) | 0; //@line 1649
 $0 = _mbed_trace_array(1370, 3) | 0; //@line 1650
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 48; //@line 1653
  HEAP32[$AsyncCtx + 4 >> 2] = $vararg_buffer7; //@line 1655
  HEAP32[$AsyncCtx + 8 >> 2] = $vararg_buffer7; //@line 1657
  sp = STACKTOP; //@line 1658
  STACKTOP = sp; //@line 1659
  return 0; //@line 1659
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1661
  HEAP32[$vararg_buffer7 >> 2] = $0; //@line 1662
  _mbed_tracef(16, 1292, 1373, $vararg_buffer7); //@line 1663
  STACKTOP = sp; //@line 1664
  return 0; //@line 1664
 }
 return 0; //@line 1666
}
function _strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0, $2 = 0, $5 = 0;
 $2 = HEAP8[$1 >> 0] | 0; //@line 8896
 do {
  if (!($2 << 24 >> 24)) {
   $$0 = $0; //@line 8900
  } else {
   $5 = _strchr($0, $2 << 24 >> 24) | 0; //@line 8903
   if (!$5) {
    $$0 = 0; //@line 8906
   } else {
    if (!(HEAP8[$1 + 1 >> 0] | 0)) {
     $$0 = $5; //@line 8912
    } else {
     if (!(HEAP8[$5 + 1 >> 0] | 0)) {
      $$0 = 0; //@line 8918
     } else {
      if (!(HEAP8[$1 + 2 >> 0] | 0)) {
       $$0 = _twobyte_strstr($5, $1) | 0; //@line 8925
       break;
      }
      if (!(HEAP8[$5 + 2 >> 0] | 0)) {
       $$0 = 0; //@line 8932
      } else {
       if (!(HEAP8[$1 + 3 >> 0] | 0)) {
        $$0 = _threebyte_strstr($5, $1) | 0; //@line 8939
        break;
       }
       if (!(HEAP8[$5 + 3 >> 0] | 0)) {
        $$0 = 0; //@line 8946
       } else {
        if (!(HEAP8[$1 + 4 >> 0] | 0)) {
         $$0 = _fourbyte_strstr($5, $1) | 0; //@line 8953
         break;
        } else {
         $$0 = _twoway_strstr($5, $1) | 0; //@line 8957
         break;
        }
       }
      }
     }
    }
   }
  }
 } while (0);
 return $$0 | 0; //@line 8967
}
function _mbed_vtracef__async_cb_34($0) {
 $0 = $0 | 0;
 var $3 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx2 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 12842
 $3 = HEAP32[36] | 0; //@line 12846
 if (HEAP8[$0 + 4 >> 0] & 1 & ($3 | 0) != 0) {
  $5 = HEAP32[28] | 0; //@line 12850
  $ReallocAsyncCtx2 = _emscripten_realloc_async_context(4) | 0; //@line 12851
  FUNCTION_TABLE_vi[$3 & 127]($5); //@line 12852
  if (___async) {
   HEAP32[$ReallocAsyncCtx2 >> 2] = 11; //@line 12855
   sp = STACKTOP; //@line 12856
   return;
  }
  ___async_unwind = 0; //@line 12859
  HEAP32[$ReallocAsyncCtx2 >> 2] = 11; //@line 12860
  sp = STACKTOP; //@line 12861
  return;
 } else {
  $6 = HEAP32[35] | 0; //@line 12864
  $7 = HEAP32[28] | 0; //@line 12865
  $ReallocAsyncCtx4 = _emscripten_realloc_async_context(4) | 0; //@line 12866
  FUNCTION_TABLE_vi[$6 & 127]($7); //@line 12867
  if (___async) {
   HEAP32[$ReallocAsyncCtx4 >> 2] = 13; //@line 12870
   sp = STACKTOP; //@line 12871
   return;
  }
  ___async_unwind = 0; //@line 12874
  HEAP32[$ReallocAsyncCtx4 >> 2] = 13; //@line 12875
  sp = STACKTOP; //@line 12876
  return;
 }
}
function _fourbyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$lcssa = 0, $$sink21$lcssa = 0, $$sink2123 = 0, $18 = 0, $32 = 0, $33 = 0, $35 = 0, $39 = 0, $40 = 0, $41 = 0;
 $18 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8 | (HEAPU8[$1 + 3 >> 0] | 0); //@line 9092
 $32 = $0 + 3 | 0; //@line 9106
 $33 = HEAP8[$32 >> 0] | 0; //@line 9107
 $35 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | (HEAPU8[$0 + 2 >> 0] | 0) << 8 | $33 & 255; //@line 9109
 if ($33 << 24 >> 24 == 0 | ($35 | 0) == ($18 | 0)) {
  $$lcssa = $33; //@line 9114
  $$sink21$lcssa = $32; //@line 9114
 } else {
  $$sink2123 = $32; //@line 9116
  $39 = $35; //@line 9116
  while (1) {
   $40 = $$sink2123 + 1 | 0; //@line 9119
   $41 = HEAP8[$40 >> 0] | 0; //@line 9120
   $39 = $39 << 8 | $41 & 255; //@line 9122
   if ($41 << 24 >> 24 == 0 | ($39 | 0) == ($18 | 0)) {
    $$lcssa = $41; //@line 9127
    $$sink21$lcssa = $40; //@line 9127
    break;
   } else {
    $$sink2123 = $40; //@line 9130
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$sink21$lcssa + -3 | 0 : 0) | 0; //@line 9137
}
function _invoke_ticker($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, $AsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 1567
 $2 = $0 + 12 | 0; //@line 1569
 $3 = HEAP32[$2 >> 2] | 0; //@line 1570
 do {
  if (!$3) {
   $AsyncCtx2 = _emscripten_alloc_async_context(12, sp) | 0; //@line 1574
   _mbed_assert_internal(1203, 1208, 528); //@line 1575
   if (___async) {
    HEAP32[$AsyncCtx2 >> 2] = 45; //@line 1578
    HEAP32[$AsyncCtx2 + 4 >> 2] = $2; //@line 1580
    HEAP32[$AsyncCtx2 + 8 >> 2] = $0; //@line 1582
    sp = STACKTOP; //@line 1583
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx2 | 0); //@line 1586
    $8 = HEAP32[$2 >> 2] | 0; //@line 1588
    break;
   }
  } else {
   $8 = $3; //@line 1592
  }
 } while (0);
 $7 = HEAP32[$8 >> 2] | 0; //@line 1595
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1597
 FUNCTION_TABLE_vi[$7 & 127]($0); //@line 1598
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 46; //@line 1601
  sp = STACKTOP; //@line 1602
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1605
  return;
 }
}
function _threebyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$016$lcssa = 0, $$01618 = 0, $$019 = 0, $$lcssa = 0, $14 = 0, $23 = 0, $24 = 0, $27 = 0, $30 = 0, $31 = 0;
 $14 = (HEAPU8[$1 + 1 >> 0] | 0) << 16 | (HEAPU8[$1 >> 0] | 0) << 24 | (HEAPU8[$1 + 2 >> 0] | 0) << 8; //@line 9026
 $23 = $0 + 2 | 0; //@line 9035
 $24 = HEAP8[$23 >> 0] | 0; //@line 9036
 $27 = (HEAPU8[$0 + 1 >> 0] | 0) << 16 | (HEAPU8[$0 >> 0] | 0) << 24 | ($24 & 255) << 8; //@line 9039
 if (($27 | 0) == ($14 | 0) | $24 << 24 >> 24 == 0) {
  $$016$lcssa = $23; //@line 9044
  $$lcssa = $24; //@line 9044
 } else {
  $$01618 = $23; //@line 9046
  $$019 = $27; //@line 9046
  while (1) {
   $30 = $$01618 + 1 | 0; //@line 9048
   $31 = HEAP8[$30 >> 0] | 0; //@line 9049
   $$019 = ($$019 | $31 & 255) << 8; //@line 9052
   if (($$019 | 0) == ($14 | 0) | $31 << 24 >> 24 == 0) {
    $$016$lcssa = $30; //@line 9057
    $$lcssa = $31; //@line 9057
    break;
   } else {
    $$01618 = $30; //@line 9060
   }
  }
 }
 return ($$lcssa << 24 >> 24 ? $$016$lcssa + -2 | 0 : 0) | 0; //@line 9067
}
function ___cxa_can_catch($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $3 = 0, $7 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10420
 STACKTOP = STACKTOP + 16 | 0; //@line 10421
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 10421
 $3 = sp; //@line 10422
 HEAP32[$3 >> 2] = HEAP32[$2 >> 2]; //@line 10424
 $7 = HEAP32[(HEAP32[$0 >> 2] | 0) + 16 >> 2] | 0; //@line 10427
 $AsyncCtx = _emscripten_alloc_async_context(16, sp) | 0; //@line 10428
 $8 = FUNCTION_TABLE_iiii[$7 & 7]($0, $1, $3) | 0; //@line 10429
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 70; //@line 10432
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 10434
  HEAP32[$AsyncCtx + 8 >> 2] = $2; //@line 10436
  HEAP32[$AsyncCtx + 12 >> 2] = $3; //@line 10438
  sp = STACKTOP; //@line 10439
  STACKTOP = sp; //@line 10440
  return 0; //@line 10440
 }
 _emscripten_free_async_context($AsyncCtx | 0); //@line 10442
 if ($8) {
  HEAP32[$2 >> 2] = HEAP32[$3 >> 2]; //@line 10446
 }
 STACKTOP = sp; //@line 10448
 return $8 & 1 | 0; //@line 10448
}
function _frexp($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 var $$0 = 0.0, $$016 = 0.0, $2 = 0, $3 = 0, $4 = 0, $9 = 0.0, $storemerge = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8654
 $2 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8654
 $3 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8655
 $4 = _bitshift64Lshr($2 | 0, $3 | 0, 52) | 0; //@line 8656
 switch ($4 & 2047) {
 case 0:
  {
   if ($0 != 0.0) {
    $9 = +_frexp($0 * 18446744073709552000.0, $1); //@line 8665
    $$016 = $9; //@line 8668
    $storemerge = (HEAP32[$1 >> 2] | 0) + -64 | 0; //@line 8668
   } else {
    $$016 = $0; //@line 8670
    $storemerge = 0; //@line 8670
   }
   HEAP32[$1 >> 2] = $storemerge; //@line 8672
   $$0 = $$016; //@line 8673
   break;
  }
 case 2047:
  {
   $$0 = $0; //@line 8677
   break;
  }
 default:
  {
   HEAP32[$1 >> 2] = ($4 & 2047) + -1022; //@line 8683
   HEAP32[tempDoublePtr >> 2] = $2; //@line 8686
   HEAP32[tempDoublePtr + 4 >> 2] = $3 & -2146435073 | 1071644672; //@line 8686
   $$0 = +HEAPF64[tempDoublePtr >> 3]; //@line 8687
  }
 }
 return +$$0;
}
function _vfprintf__async_cb($0) {
 $0 = $0 | 0;
 var $$ = 0, $10 = 0, $12 = 0, $14 = 0, $16 = 0, $18 = 0, $2 = 0, $20 = 0, $22 = 0, $33 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10517
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 10525
 $12 = HEAP32[$0 + 24 >> 2] | 0; //@line 10527
 $14 = HEAP32[$0 + 28 >> 2] | 0; //@line 10529
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 10531
 $18 = HEAP32[$0 + 36 >> 2] | 0; //@line 10533
 $20 = HEAP32[$0 + 40 >> 2] | 0; //@line 10535
 $22 = HEAP32[$0 + 44 >> 2] | 0; //@line 10537
 $$ = (HEAP32[$2 >> 2] | 0) == 0 ? -1 : HEAP32[$0 + 8 >> 2] | 0; //@line 10548
 HEAP32[HEAP32[$0 + 16 >> 2] >> 2] = HEAP32[$0 + 12 >> 2]; //@line 10549
 HEAP32[$10 >> 2] = 0; //@line 10550
 HEAP32[$12 >> 2] = 0; //@line 10551
 HEAP32[$14 >> 2] = 0; //@line 10552
 HEAP32[$2 >> 2] = 0; //@line 10553
 $33 = HEAP32[$16 >> 2] | 0; //@line 10554
 HEAP32[$16 >> 2] = $33 | $18; //@line 10559
 if ($20 | 0) {
  ___unlockfile($22); //@line 10562
 }
 HEAP32[___async_retval >> 2] = ($33 & 32 | 0) == 0 ? $$ : -1; //@line 10565
 return;
}
function _mbed_vtracef__async_cb_31($0) {
 $0 = $0 | 0;
 var $$pre = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12573
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 12577
 if ((HEAP32[$0 + 4 >> 2] | 0) <= 2) {
  return;
 }
 $5 = $4 + -1 | 0; //@line 12582
 $$pre = HEAP32[38] | 0; //@line 12583
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 12584
 FUNCTION_TABLE_v[$$pre & 0](); //@line 12585
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 12588
  $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 12589
  HEAP32[$6 >> 2] = $4; //@line 12590
  $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 12591
  HEAP32[$7 >> 2] = $5; //@line 12592
  sp = STACKTOP; //@line 12593
  return;
 }
 ___async_unwind = 0; //@line 12596
 HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 12597
 $6 = $ReallocAsyncCtx9 + 4 | 0; //@line 12598
 HEAP32[$6 >> 2] = $4; //@line 12599
 $7 = $ReallocAsyncCtx9 + 8 | 0; //@line 12600
 HEAP32[$7 >> 2] = $5; //@line 12601
 sp = STACKTOP; //@line 12602
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 var $10 = 0, $13 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10212
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 10218
  } else {
   $10 = HEAP32[$0 + 8 >> 2] | 0; //@line 10221
   $13 = HEAP32[(HEAP32[$10 >> 2] | 0) + 20 >> 2] | 0; //@line 10224
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10225
   FUNCTION_TABLE_viiiiii[$13 & 3]($10, $1, $2, $3, $4, $5); //@line 10226
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 66; //@line 10229
    sp = STACKTOP; //@line 10230
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10233
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_vtracef__async_cb_30($0) {
 $0 = $0 | 0;
 var $$pre = 0, $2 = 0, $4 = 0, $5 = 0, $6 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 12540
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 12542
 if (($2 | 0) <= 1) {
  return;
 }
 $4 = $2 + -1 | 0; //@line 12547
 $$pre = HEAP32[38] | 0; //@line 12548
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(12) | 0; //@line 12549
 FUNCTION_TABLE_v[$$pre & 0](); //@line 12550
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 12553
  $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 12554
  HEAP32[$5 >> 2] = $2; //@line 12555
  $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 12556
  HEAP32[$6 >> 2] = $4; //@line 12557
  sp = STACKTOP; //@line 12558
  return;
 }
 ___async_unwind = 0; //@line 12561
 HEAP32[$ReallocAsyncCtx9 >> 2] = 20; //@line 12562
 $5 = $ReallocAsyncCtx9 + 4 | 0; //@line 12563
 HEAP32[$5 >> 2] = $2; //@line 12564
 $6 = $ReallocAsyncCtx9 + 8 | 0; //@line 12565
 HEAP32[$6 >> 2] = $4; //@line 12566
 sp = STACKTOP; //@line 12567
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $11 = 0, $8 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10381
 do {
  if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 10387
  } else {
   $8 = HEAP32[$0 + 8 >> 2] | 0; //@line 10390
   $11 = HEAP32[(HEAP32[$8 >> 2] | 0) + 28 >> 2] | 0; //@line 10393
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10394
   FUNCTION_TABLE_viiii[$11 & 3]($8, $1, $2, $3); //@line 10395
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 69; //@line 10398
    sp = STACKTOP; //@line 10399
    return;
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10402
    break;
   }
  }
 } while (0);
 return;
}
function _mbed_error_vfprintf__async_cb_23($0) {
 $0 = $0 | 0;
 var $10 = 0, $2 = 0, $4 = 0, $6 = 0, $8 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 11672
 $2 = HEAP8[$0 + 4 >> 0] | 0; //@line 11674
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11676
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11678
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11680
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11682
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(24) | 0; //@line 11684
 _serial_putc(4012, $2 << 24 >> 24); //@line 11685
 if (!___async) {
  ___async_unwind = 0; //@line 11688
 }
 HEAP32[$ReallocAsyncCtx2 >> 2] = 42; //@line 11690
 HEAP32[$ReallocAsyncCtx2 + 4 >> 2] = $4; //@line 11692
 HEAP32[$ReallocAsyncCtx2 + 8 >> 2] = $6; //@line 11694
 HEAP32[$ReallocAsyncCtx2 + 12 >> 2] = $8; //@line 11696
 HEAP8[$ReallocAsyncCtx2 + 16 >> 0] = $2; //@line 11698
 HEAP32[$ReallocAsyncCtx2 + 20 >> 2] = $10; //@line 11700
 sp = STACKTOP; //@line 11701
 return;
}
function ___dynamic_cast__async_cb_35($0) {
 $0 = $0 | 0;
 var $$0 = 0, $10 = 0, $16 = 0, $6 = 0, $8 = 0;
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 12908
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 12910
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 12912
 $16 = HEAP32[$0 + 32 >> 2] | 0; //@line 12918
 L2 : do {
  switch (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) {
  case 0:
   {
    $$0 = (HEAP32[$6 >> 2] | 0) == 1 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1 ? HEAP32[HEAP32[$0 + 24 >> 2] >> 2] | 0 : 0; //@line 12933
    break;
   }
  case 1:
   {
    if ((HEAP32[HEAP32[$0 + 28 >> 2] >> 2] | 0) != 1) {
     if (!((HEAP32[$6 >> 2] | 0) == 0 & (HEAP32[$8 >> 2] | 0) == 1 & (HEAP32[$10 >> 2] | 0) == 1)) {
      $$0 = 0; //@line 12949
      break L2;
     }
    }
    $$0 = HEAP32[$16 >> 2] | 0; //@line 12954
    break;
   }
  default:
   {
    $$0 = 0; //@line 12958
   }
  }
 } while (0);
 HEAP32[___async_retval >> 2] = $$0; //@line 12963
 return;
}
function _pad_676($0, $1, $2, $3, $4) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 var $$0$lcssa = 0, $$011 = 0, $14 = 0, $5 = 0, $9 = 0, sp = 0;
 sp = STACKTOP; //@line 7652
 STACKTOP = STACKTOP + 256 | 0; //@line 7653
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(256); //@line 7653
 $5 = sp; //@line 7654
 if (($2 | 0) > ($3 | 0) & ($4 & 73728 | 0) == 0) {
  $9 = $2 - $3 | 0; //@line 7660
  _memset($5 | 0, $1 << 24 >> 24 | 0, ($9 >>> 0 < 256 ? $9 : 256) | 0) | 0; //@line 7664
  if ($9 >>> 0 > 255) {
   $14 = $2 - $3 | 0; //@line 7667
   $$011 = $9; //@line 7668
   do {
    _out_670($0, $5, 256); //@line 7670
    $$011 = $$011 + -256 | 0; //@line 7671
   } while ($$011 >>> 0 > 255);
   $$0$lcssa = $14 & 255; //@line 7680
  } else {
   $$0$lcssa = $9; //@line 7682
  }
  _out_670($0, $5, $$0$lcssa); //@line 7684
 }
 STACKTOP = sp; //@line 7686
 return;
}
function ___stdio_seek($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $3 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4947
 STACKTOP = STACKTOP + 32 | 0; //@line 4948
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 4948
 $vararg_buffer = sp; //@line 4949
 $3 = sp + 20 | 0; //@line 4950
 HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 4954
 HEAP32[$vararg_buffer + 4 >> 2] = 0; //@line 4956
 HEAP32[$vararg_buffer + 8 >> 2] = $1; //@line 4958
 HEAP32[$vararg_buffer + 12 >> 2] = $3; //@line 4960
 HEAP32[$vararg_buffer + 16 >> 2] = $2; //@line 4962
 if ((___syscall_ret(___syscall140(140, $vararg_buffer | 0) | 0) | 0) < 0) {
  HEAP32[$3 >> 2] = -1; //@line 4967
  $10 = -1; //@line 4968
 } else {
  $10 = HEAP32[$3 >> 2] | 0; //@line 4971
 }
 STACKTOP = sp; //@line 4973
 return $10 | 0; //@line 4973
}
function _mbed_assert_internal($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $AsyncCtx = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 1042
 STACKTOP = STACKTOP + 16 | 0; //@line 1043
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1043
 $vararg_buffer = sp; //@line 1044
 HEAP32[$vararg_buffer >> 2] = $0; //@line 1045
 HEAP32[$vararg_buffer + 4 >> 2] = $1; //@line 1047
 HEAP32[$vararg_buffer + 8 >> 2] = $2; //@line 1049
 _mbed_error_printf(1080, $vararg_buffer); //@line 1050
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1051
 _mbed_die(); //@line 1052
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 22; //@line 1055
  sp = STACKTOP; //@line 1056
  STACKTOP = sp; //@line 1057
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1059
  STACKTOP = sp; //@line 1060
  return;
 }
}
function _mbed_vtracef__async_cb_29($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12510
 HEAP32[32] = HEAP32[30]; //@line 12512
 $2 = HEAP32[38] | 0; //@line 12513
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 12518
 HEAP32[39] = 0; //@line 12519
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12520
 FUNCTION_TABLE_v[$2 & 0](); //@line 12521
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12524
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12525
  HEAP32[$5 >> 2] = $4; //@line 12526
  sp = STACKTOP; //@line 12527
  return;
 }
 ___async_unwind = 0; //@line 12530
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12531
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12532
 HEAP32[$5 >> 2] = $4; //@line 12533
 sp = STACKTOP; //@line 12534
 return;
}
function _mbed_vtracef__async_cb_26($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12246
 HEAP32[32] = HEAP32[30]; //@line 12248
 $2 = HEAP32[38] | 0; //@line 12249
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 12254
 HEAP32[39] = 0; //@line 12255
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12256
 FUNCTION_TABLE_v[$2 & 0](); //@line 12257
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12260
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12261
  HEAP32[$5 >> 2] = $4; //@line 12262
  sp = STACKTOP; //@line 12263
  return;
 }
 ___async_unwind = 0; //@line 12266
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12267
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12268
 HEAP32[$5 >> 2] = $4; //@line 12269
 sp = STACKTOP; //@line 12270
 return;
}
function _mbed_vtracef__async_cb_25($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $5 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 12216
 HEAP32[32] = HEAP32[30]; //@line 12218
 $2 = HEAP32[38] | 0; //@line 12219
 if (!$2) {
  return;
 }
 $4 = HEAP32[39] | 0; //@line 12224
 HEAP32[39] = 0; //@line 12225
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 12226
 FUNCTION_TABLE_v[$2 & 0](); //@line 12227
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12230
  $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12231
  HEAP32[$5 >> 2] = $4; //@line 12232
  sp = STACKTOP; //@line 12233
  return;
 }
 ___async_unwind = 0; //@line 12236
 HEAP32[$ReallocAsyncCtx8 >> 2] = 19; //@line 12237
 $5 = $ReallocAsyncCtx8 + 4 | 0; //@line 12238
 HEAP32[$5 >> 2] = $4; //@line 12239
 sp = STACKTOP; //@line 12240
 return;
}
function _snprintf($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $4 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 9531
 STACKTOP = STACKTOP + 16 | 0; //@line 9532
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 9532
 $3 = sp; //@line 9533
 HEAP32[$3 >> 2] = $varargs; //@line 9534
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 9535
 $4 = _vsnprintf($0, $1, $2, $3) | 0; //@line 9536
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 59; //@line 9539
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 9541
  sp = STACKTOP; //@line 9542
  STACKTOP = sp; //@line 9543
  return 0; //@line 9543
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 9545
  STACKTOP = sp; //@line 9546
  return $4 | 0; //@line 9546
 }
 return 0; //@line 9548
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $10 = 0, $13 = 0, $4 = 0, $5 = 0;
 $4 = $1 + 16 | 0; //@line 9934
 $5 = HEAP32[$4 >> 2] | 0; //@line 9935
 do {
  if (!$5) {
   HEAP32[$4 >> 2] = $2; //@line 9939
   HEAP32[$1 + 24 >> 2] = $3; //@line 9941
   HEAP32[$1 + 36 >> 2] = 1; //@line 9943
  } else {
   if (($5 | 0) != ($2 | 0)) {
    $13 = $1 + 36 | 0; //@line 9947
    HEAP32[$13 >> 2] = (HEAP32[$13 >> 2] | 0) + 1; //@line 9950
    HEAP32[$1 + 24 >> 2] = 2; //@line 9952
    HEAP8[$1 + 54 >> 0] = 1; //@line 9954
    break;
   }
   $10 = $1 + 24 | 0; //@line 9957
   if ((HEAP32[$10 >> 2] | 0) == 2) {
    HEAP32[$10 >> 2] = $3; //@line 9961
   }
  }
 } while (0);
 return;
}
function _strcmp($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $2 = 0, $3 = 0, $8 = 0, $9 = 0;
 $2 = HEAP8[$0 >> 0] | 0; //@line 5054
 $3 = HEAP8[$1 >> 0] | 0; //@line 5055
 if ($2 << 24 >> 24 == 0 ? 1 : $2 << 24 >> 24 != $3 << 24 >> 24) {
  $$lcssa = $3; //@line 5060
  $$lcssa8 = $2; //@line 5060
 } else {
  $$011 = $1; //@line 5062
  $$0710 = $0; //@line 5062
  do {
   $$0710 = $$0710 + 1 | 0; //@line 5064
   $$011 = $$011 + 1 | 0; //@line 5065
   $8 = HEAP8[$$0710 >> 0] | 0; //@line 5066
   $9 = HEAP8[$$011 >> 0] | 0; //@line 5067
  } while (!($8 << 24 >> 24 == 0 ? 1 : $8 << 24 >> 24 != $9 << 24 >> 24));
  $$lcssa = $9; //@line 5072
  $$lcssa8 = $8; //@line 5072
 }
 return ($$lcssa8 & 255) - ($$lcssa & 255) | 0; //@line 5082
}
function _serial_putc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0, $AsyncCtx = 0, $AsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 1539
 $2 = HEAP32[40] | 0; //@line 1540
 $AsyncCtx3 = _emscripten_alloc_async_context(8, sp) | 0; //@line 1541
 _putc($1, $2) | 0; //@line 1542
 if (___async) {
  HEAP32[$AsyncCtx3 >> 2] = 43; //@line 1545
  HEAP32[$AsyncCtx3 + 4 >> 2] = $2; //@line 1547
  sp = STACKTOP; //@line 1548
  return;
 }
 _emscripten_free_async_context($AsyncCtx3 | 0); //@line 1551
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1552
 _fflush($2) | 0; //@line 1553
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 44; //@line 1556
  sp = STACKTOP; //@line 1557
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1560
  return;
 }
}
function _mbed_die__async_cb_16($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx15 = 0, sp = 0;
 sp = STACKTOP; //@line 10952
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10954
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10956
 $ReallocAsyncCtx15 = _emscripten_realloc_async_context(8) | 0; //@line 10957
 _wait_ms(150); //@line 10958
 if (___async) {
  HEAP32[$ReallocAsyncCtx15 >> 2] = 24; //@line 10961
  $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 10962
  HEAP32[$4 >> 2] = $2; //@line 10963
  sp = STACKTOP; //@line 10964
  return;
 }
 ___async_unwind = 0; //@line 10967
 HEAP32[$ReallocAsyncCtx15 >> 2] = 24; //@line 10968
 $4 = $ReallocAsyncCtx15 + 4 | 0; //@line 10969
 HEAP32[$4 >> 2] = $2; //@line 10970
 sp = STACKTOP; //@line 10971
 return;
}
function _mbed_die__async_cb_15($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx14 = 0, sp = 0;
 sp = STACKTOP; //@line 10927
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10929
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 10931
 $ReallocAsyncCtx14 = _emscripten_realloc_async_context(8) | 0; //@line 10932
 _wait_ms(150); //@line 10933
 if (___async) {
  HEAP32[$ReallocAsyncCtx14 >> 2] = 25; //@line 10936
  $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 10937
  HEAP32[$4 >> 2] = $2; //@line 10938
  sp = STACKTOP; //@line 10939
  return;
 }
 ___async_unwind = 0; //@line 10942
 HEAP32[$ReallocAsyncCtx14 >> 2] = 25; //@line 10943
 $4 = $ReallocAsyncCtx14 + 4 | 0; //@line 10944
 HEAP32[$4 >> 2] = $2; //@line 10945
 sp = STACKTOP; //@line 10946
 return;
}
function _mbed_die__async_cb_14($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx13 = 0, sp = 0;
 sp = STACKTOP; //@line 10902
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10904
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10906
 $ReallocAsyncCtx13 = _emscripten_realloc_async_context(8) | 0; //@line 10907
 _wait_ms(150); //@line 10908
 if (___async) {
  HEAP32[$ReallocAsyncCtx13 >> 2] = 26; //@line 10911
  $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 10912
  HEAP32[$4 >> 2] = $2; //@line 10913
  sp = STACKTOP; //@line 10914
  return;
 }
 ___async_unwind = 0; //@line 10917
 HEAP32[$ReallocAsyncCtx13 >> 2] = 26; //@line 10918
 $4 = $ReallocAsyncCtx13 + 4 | 0; //@line 10919
 HEAP32[$4 >> 2] = $2; //@line 10920
 sp = STACKTOP; //@line 10921
 return;
}
function _mbed_die__async_cb_13($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx12 = 0, sp = 0;
 sp = STACKTOP; //@line 10877
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10879
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 10881
 $ReallocAsyncCtx12 = _emscripten_realloc_async_context(8) | 0; //@line 10882
 _wait_ms(150); //@line 10883
 if (___async) {
  HEAP32[$ReallocAsyncCtx12 >> 2] = 27; //@line 10886
  $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 10887
  HEAP32[$4 >> 2] = $2; //@line 10888
  sp = STACKTOP; //@line 10889
  return;
 }
 ___async_unwind = 0; //@line 10892
 HEAP32[$ReallocAsyncCtx12 >> 2] = 27; //@line 10893
 $4 = $ReallocAsyncCtx12 + 4 | 0; //@line 10894
 HEAP32[$4 >> 2] = $2; //@line 10895
 sp = STACKTOP; //@line 10896
 return;
}
function _mbed_die__async_cb_12($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx11 = 0, sp = 0;
 sp = STACKTOP; //@line 10852
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10854
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10856
 $ReallocAsyncCtx11 = _emscripten_realloc_async_context(8) | 0; //@line 10857
 _wait_ms(150); //@line 10858
 if (___async) {
  HEAP32[$ReallocAsyncCtx11 >> 2] = 28; //@line 10861
  $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 10862
  HEAP32[$4 >> 2] = $2; //@line 10863
  sp = STACKTOP; //@line 10864
  return;
 }
 ___async_unwind = 0; //@line 10867
 HEAP32[$ReallocAsyncCtx11 >> 2] = 28; //@line 10868
 $4 = $ReallocAsyncCtx11 + 4 | 0; //@line 10869
 HEAP32[$4 >> 2] = $2; //@line 10870
 sp = STACKTOP; //@line 10871
 return;
}
function _mbed_die__async_cb_11($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx10 = 0, sp = 0;
 sp = STACKTOP; //@line 10827
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10829
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 10831
 $ReallocAsyncCtx10 = _emscripten_realloc_async_context(8) | 0; //@line 10832
 _wait_ms(150); //@line 10833
 if (___async) {
  HEAP32[$ReallocAsyncCtx10 >> 2] = 29; //@line 10836
  $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 10837
  HEAP32[$4 >> 2] = $2; //@line 10838
  sp = STACKTOP; //@line 10839
  return;
 }
 ___async_unwind = 0; //@line 10842
 HEAP32[$ReallocAsyncCtx10 >> 2] = 29; //@line 10843
 $4 = $ReallocAsyncCtx10 + 4 | 0; //@line 10844
 HEAP32[$4 >> 2] = $2; //@line 10845
 sp = STACKTOP; //@line 10846
 return;
}
function _memcmp($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $14 = 0, $4 = 0, $5 = 0;
 L1 : do {
  if (!$2) {
   $14 = 0; //@line 9496
  } else {
   $$01318 = $0; //@line 9498
   $$01417 = $2; //@line 9498
   $$019 = $1; //@line 9498
   while (1) {
    $4 = HEAP8[$$01318 >> 0] | 0; //@line 9500
    $5 = HEAP8[$$019 >> 0] | 0; //@line 9501
    if ($4 << 24 >> 24 != $5 << 24 >> 24) {
     break;
    }
    $$01417 = $$01417 + -1 | 0; //@line 9506
    if (!$$01417) {
     $14 = 0; //@line 9511
     break L1;
    } else {
     $$01318 = $$01318 + 1 | 0; //@line 9514
     $$019 = $$019 + 1 | 0; //@line 9514
    }
   }
   $14 = ($4 & 255) - ($5 & 255) | 0; //@line 9520
  }
 } while (0);
 return $14 | 0; //@line 9523
}
function _mbed_die__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx16 = 0, sp = 0;
 sp = STACKTOP; //@line 10577
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10579
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 10581
 $ReallocAsyncCtx16 = _emscripten_realloc_async_context(8) | 0; //@line 10582
 _wait_ms(150); //@line 10583
 if (___async) {
  HEAP32[$ReallocAsyncCtx16 >> 2] = 23; //@line 10586
  $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 10587
  HEAP32[$4 >> 2] = $2; //@line 10588
  sp = STACKTOP; //@line 10589
  return;
 }
 ___async_unwind = 0; //@line 10592
 HEAP32[$ReallocAsyncCtx16 >> 2] = 23; //@line 10593
 $4 = $ReallocAsyncCtx16 + 4 | 0; //@line 10594
 HEAP32[$4 >> 2] = $2; //@line 10595
 sp = STACKTOP; //@line 10596
 return;
}
function ___stdout_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $14 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 5006
 STACKTOP = STACKTOP + 32 | 0; //@line 5007
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(32); //@line 5007
 $vararg_buffer = sp; //@line 5008
 HEAP32[$0 + 36 >> 2] = 5; //@line 5011
 if (!(HEAP32[$0 >> 2] & 64)) {
  HEAP32[$vararg_buffer >> 2] = HEAP32[$0 + 60 >> 2]; //@line 5019
  HEAP32[$vararg_buffer + 4 >> 2] = 21523; //@line 5021
  HEAP32[$vararg_buffer + 8 >> 2] = sp + 16; //@line 5023
  if (___syscall54(54, $vararg_buffer | 0) | 0) {
   HEAP8[$0 + 75 >> 0] = -1; //@line 5028
  }
 }
 $14 = ___stdio_write($0, $1, $2) | 0; //@line 5031
 STACKTOP = sp; //@line 5032
 return $14 | 0; //@line 5032
}
function _mbed_die__async_cb_10($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx9 = 0, sp = 0;
 sp = STACKTOP; //@line 10802
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10804
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10806
 $ReallocAsyncCtx9 = _emscripten_realloc_async_context(8) | 0; //@line 10807
 _wait_ms(150); //@line 10808
 if (___async) {
  HEAP32[$ReallocAsyncCtx9 >> 2] = 30; //@line 10811
  $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 10812
  HEAP32[$4 >> 2] = $2; //@line 10813
  sp = STACKTOP; //@line 10814
  return;
 }
 ___async_unwind = 0; //@line 10817
 HEAP32[$ReallocAsyncCtx9 >> 2] = 30; //@line 10818
 $4 = $ReallocAsyncCtx9 + 4 | 0; //@line 10819
 HEAP32[$4 >> 2] = $2; //@line 10820
 sp = STACKTOP; //@line 10821
 return;
}
function _mbed_die__async_cb_9($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx8 = 0, sp = 0;
 sp = STACKTOP; //@line 10777
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10779
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 10781
 $ReallocAsyncCtx8 = _emscripten_realloc_async_context(8) | 0; //@line 10782
 _wait_ms(400); //@line 10783
 if (___async) {
  HEAP32[$ReallocAsyncCtx8 >> 2] = 31; //@line 10786
  $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 10787
  HEAP32[$4 >> 2] = $2; //@line 10788
  sp = STACKTOP; //@line 10789
  return;
 }
 ___async_unwind = 0; //@line 10792
 HEAP32[$ReallocAsyncCtx8 >> 2] = 31; //@line 10793
 $4 = $ReallocAsyncCtx8 + 4 | 0; //@line 10794
 HEAP32[$4 >> 2] = $2; //@line 10795
 sp = STACKTOP; //@line 10796
 return;
}
function _mbed_die__async_cb_8($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx7 = 0, sp = 0;
 sp = STACKTOP; //@line 10752
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10754
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10756
 $ReallocAsyncCtx7 = _emscripten_realloc_async_context(8) | 0; //@line 10757
 _wait_ms(400); //@line 10758
 if (___async) {
  HEAP32[$ReallocAsyncCtx7 >> 2] = 32; //@line 10761
  $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 10762
  HEAP32[$4 >> 2] = $2; //@line 10763
  sp = STACKTOP; //@line 10764
  return;
 }
 ___async_unwind = 0; //@line 10767
 HEAP32[$ReallocAsyncCtx7 >> 2] = 32; //@line 10768
 $4 = $ReallocAsyncCtx7 + 4 | 0; //@line 10769
 HEAP32[$4 >> 2] = $2; //@line 10770
 sp = STACKTOP; //@line 10771
 return;
}
function _mbed_die__async_cb_7($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx6 = 0, sp = 0;
 sp = STACKTOP; //@line 10727
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10729
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 10731
 $ReallocAsyncCtx6 = _emscripten_realloc_async_context(8) | 0; //@line 10732
 _wait_ms(400); //@line 10733
 if (___async) {
  HEAP32[$ReallocAsyncCtx6 >> 2] = 33; //@line 10736
  $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 10737
  HEAP32[$4 >> 2] = $2; //@line 10738
  sp = STACKTOP; //@line 10739
  return;
 }
 ___async_unwind = 0; //@line 10742
 HEAP32[$ReallocAsyncCtx6 >> 2] = 33; //@line 10743
 $4 = $ReallocAsyncCtx6 + 4 | 0; //@line 10744
 HEAP32[$4 >> 2] = $2; //@line 10745
 sp = STACKTOP; //@line 10746
 return;
}
function _mbed_die__async_cb_6($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx5 = 0, sp = 0;
 sp = STACKTOP; //@line 10702
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10704
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10706
 $ReallocAsyncCtx5 = _emscripten_realloc_async_context(8) | 0; //@line 10707
 _wait_ms(400); //@line 10708
 if (___async) {
  HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 10711
  $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 10712
  HEAP32[$4 >> 2] = $2; //@line 10713
  sp = STACKTOP; //@line 10714
  return;
 }
 ___async_unwind = 0; //@line 10717
 HEAP32[$ReallocAsyncCtx5 >> 2] = 34; //@line 10718
 $4 = $ReallocAsyncCtx5 + 4 | 0; //@line 10719
 HEAP32[$4 >> 2] = $2; //@line 10720
 sp = STACKTOP; //@line 10721
 return;
}
function _mbed_die__async_cb_5($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx4 = 0, sp = 0;
 sp = STACKTOP; //@line 10677
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10679
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 10681
 $ReallocAsyncCtx4 = _emscripten_realloc_async_context(8) | 0; //@line 10682
 _wait_ms(400); //@line 10683
 if (___async) {
  HEAP32[$ReallocAsyncCtx4 >> 2] = 35; //@line 10686
  $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 10687
  HEAP32[$4 >> 2] = $2; //@line 10688
  sp = STACKTOP; //@line 10689
  return;
 }
 ___async_unwind = 0; //@line 10692
 HEAP32[$ReallocAsyncCtx4 >> 2] = 35; //@line 10693
 $4 = $ReallocAsyncCtx4 + 4 | 0; //@line 10694
 HEAP32[$4 >> 2] = $2; //@line 10695
 sp = STACKTOP; //@line 10696
 return;
}
function _mbed_die__async_cb_4($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 10652
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10654
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10656
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(8) | 0; //@line 10657
 _wait_ms(400); //@line 10658
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 36; //@line 10661
  $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 10662
  HEAP32[$4 >> 2] = $2; //@line 10663
  sp = STACKTOP; //@line 10664
  return;
 }
 ___async_unwind = 0; //@line 10667
 HEAP32[$ReallocAsyncCtx3 >> 2] = 36; //@line 10668
 $4 = $ReallocAsyncCtx3 + 4 | 0; //@line 10669
 HEAP32[$4 >> 2] = $2; //@line 10670
 sp = STACKTOP; //@line 10671
 return;
}
function _mbed_die__async_cb_3($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx2 = 0, sp = 0;
 sp = STACKTOP; //@line 10627
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10629
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 1) | 0; //@line 10631
 $ReallocAsyncCtx2 = _emscripten_realloc_async_context(8) | 0; //@line 10632
 _wait_ms(400); //@line 10633
 if (___async) {
  HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 10636
  $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 10637
  HEAP32[$4 >> 2] = $2; //@line 10638
  sp = STACKTOP; //@line 10639
  return;
 }
 ___async_unwind = 0; //@line 10642
 HEAP32[$ReallocAsyncCtx2 >> 2] = 37; //@line 10643
 $4 = $ReallocAsyncCtx2 + 4 | 0; //@line 10644
 HEAP32[$4 >> 2] = $2; //@line 10645
 sp = STACKTOP; //@line 10646
 return;
}
function _mbed_die__async_cb_2($0) {
 $0 = $0 | 0;
 var $2 = 0, $4 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10602
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10604
 _emscripten_asm_const_iii(1, HEAP32[$2 >> 2] | 0, 0) | 0; //@line 10606
 $ReallocAsyncCtx = _emscripten_realloc_async_context(8) | 0; //@line 10607
 _wait_ms(400); //@line 10608
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 38; //@line 10611
  $4 = $ReallocAsyncCtx + 4 | 0; //@line 10612
  HEAP32[$4 >> 2] = $2; //@line 10613
  sp = STACKTOP; //@line 10614
  return;
 }
 ___async_unwind = 0; //@line 10617
 HEAP32[$ReallocAsyncCtx >> 2] = 38; //@line 10618
 $4 = $ReallocAsyncCtx + 4 | 0; //@line 10619
 HEAP32[$4 >> 2] = $2; //@line 10620
 sp = STACKTOP; //@line 10621
 return;
}
function _mbed_tracef($0, $1, $2, $varargs) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $varargs = $varargs | 0;
 var $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 246
 STACKTOP = STACKTOP + 16 | 0; //@line 247
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 247
 $3 = sp; //@line 248
 HEAP32[$3 >> 2] = $varargs; //@line 249
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 250
 _mbed_vtracef($0, $1, $2, $3); //@line 251
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 8; //@line 254
  HEAP32[$AsyncCtx + 4 >> 2] = $3; //@line 256
  sp = STACKTOP; //@line 257
  STACKTOP = sp; //@line 258
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 260
  STACKTOP = sp; //@line 261
  return;
 }
}
function _mbed_error_printf($0, $varargs) {
 $0 = $0 | 0;
 $varargs = $varargs | 0;
 var $1 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1370
 STACKTOP = STACKTOP + 16 | 0; //@line 1371
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 1371
 $1 = sp; //@line 1372
 HEAP32[$1 >> 2] = $varargs; //@line 1373
 $AsyncCtx = _emscripten_alloc_async_context(8, sp) | 0; //@line 1374
 _mbed_error_vfprintf($0, $1); //@line 1375
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 39; //@line 1378
  HEAP32[$AsyncCtx + 4 >> 2] = $1; //@line 1380
  sp = STACKTOP; //@line 1381
  STACKTOP = sp; //@line 1382
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1384
  STACKTOP = sp; //@line 1385
  return;
 }
}
function _sbrk(increment) {
 increment = increment | 0;
 var oldDynamicTop = 0, newDynamicTop = 0;
 oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0; //@line 13616
 newDynamicTop = oldDynamicTop + increment | 0; //@line 13617
 if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
  abortOnCannotGrowMemory() | 0; //@line 13621
  ___setErrNo(12); //@line 13622
  return -1;
 }
 HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop; //@line 13626
 if ((newDynamicTop | 0) > (getTotalMemory() | 0)) {
  if (!(enlargeMemory() | 0)) {
   HEAP32[DYNAMICTOP_PTR >> 2] = oldDynamicTop; //@line 13630
   ___setErrNo(12); //@line 13631
   return -1;
  }
 }
 return oldDynamicTop | 0; //@line 13635
}
function _fwrite($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$ = 0, $11 = 0, $13 = 0, $15 = 0, $4 = 0, $phitmp = 0;
 $4 = Math_imul($2, $1) | 0; //@line 5177
 $$ = ($1 | 0) == 0 ? 0 : $2; //@line 5179
 if ((HEAP32[$3 + 76 >> 2] | 0) > -1) {
  $phitmp = (___lockfile($3) | 0) == 0; //@line 5185
  $11 = ___fwritex($0, $4, $3) | 0; //@line 5186
  if ($phitmp) {
   $13 = $11; //@line 5188
  } else {
   ___unlockfile($3); //@line 5190
   $13 = $11; //@line 5191
  }
 } else {
  $13 = ___fwritex($0, $4, $3) | 0; //@line 5195
 }
 if (($13 | 0) == ($4 | 0)) {
  $15 = $$; //@line 5199
 } else {
  $15 = ($13 >>> 0) / ($1 >>> 0) | 0; //@line 5202
 }
 return $15 | 0; //@line 5204
}
function _fmt_x($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $$05$lcssa = 0, $$056 = 0, $14 = 0, $15 = 0, $8 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$05$lcssa = $2; //@line 7513
 } else {
  $$056 = $2; //@line 7515
  $15 = $1; //@line 7515
  $8 = $0; //@line 7515
  while (1) {
   $14 = $$056 + -1 | 0; //@line 7523
   HEAP8[$14 >> 0] = HEAPU8[1908 + ($8 & 15) >> 0] | 0 | $3; //@line 7524
   $8 = _bitshift64Lshr($8 | 0, $15 | 0, 4) | 0; //@line 7525
   $15 = tempRet0; //@line 7526
   if (($8 | 0) == 0 & ($15 | 0) == 0) {
    $$05$lcssa = $14; //@line 7531
    break;
   } else {
    $$056 = $14; //@line 7534
   }
  }
 }
 return $$05$lcssa | 0; //@line 7538
}
function ___towrite($0) {
 $0 = $0 | 0;
 var $$0 = 0, $1 = 0, $14 = 0, $3 = 0, $7 = 0;
 $1 = $0 + 74 | 0; //@line 5394
 $3 = HEAP8[$1 >> 0] | 0; //@line 5396
 HEAP8[$1 >> 0] = $3 + 255 | $3; //@line 5400
 $7 = HEAP32[$0 >> 2] | 0; //@line 5401
 if (!($7 & 8)) {
  HEAP32[$0 + 8 >> 2] = 0; //@line 5406
  HEAP32[$0 + 4 >> 2] = 0; //@line 5408
  $14 = HEAP32[$0 + 44 >> 2] | 0; //@line 5410
  HEAP32[$0 + 28 >> 2] = $14; //@line 5412
  HEAP32[$0 + 20 >> 2] = $14; //@line 5414
  HEAP32[$0 + 16 >> 2] = $14 + (HEAP32[$0 + 48 >> 2] | 0); //@line 5420
  $$0 = 0; //@line 5421
 } else {
  HEAP32[$0 >> 2] = $7 | 32; //@line 5424
  $$0 = -1; //@line 5425
 }
 return $$0 | 0; //@line 5427
}
function _twobyte_strstr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$sink$in = 0, $$sink17$sink = 0, $11 = 0, $12 = 0, $8 = 0;
 $8 = (HEAPU8[$1 >> 0] | 0) << 8 | (HEAPU8[$1 + 1 >> 0] | 0); //@line 8981
 $$sink$in = HEAPU8[$0 >> 0] | 0; //@line 8984
 $$sink17$sink = $0; //@line 8984
 while (1) {
  $11 = $$sink17$sink + 1 | 0; //@line 8986
  $12 = HEAP8[$11 >> 0] | 0; //@line 8987
  if (!($12 << 24 >> 24)) {
   break;
  }
  $$sink$in = $$sink$in << 8 & 65280 | $12 & 255; //@line 8995
  if (($$sink$in | 0) == ($8 | 0)) {
   break;
  } else {
   $$sink17$sink = $11; //@line 9000
  }
 }
 return ($12 << 24 >> 24 ? $$sink17$sink : 0) | 0; //@line 9005
}
function _fmt_o($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $7 = 0;
 if (($0 | 0) == 0 & ($1 | 0) == 0) {
  $$0$lcssa = $2; //@line 7550
 } else {
  $$06 = $2; //@line 7552
  $11 = $1; //@line 7552
  $7 = $0; //@line 7552
  while (1) {
   $10 = $$06 + -1 | 0; //@line 7557
   HEAP8[$10 >> 0] = $7 & 7 | 48; //@line 7558
   $7 = _bitshift64Lshr($7 | 0, $11 | 0, 3) | 0; //@line 7559
   $11 = tempRet0; //@line 7560
   if (($7 | 0) == 0 & ($11 | 0) == 0) {
    $$0$lcssa = $10; //@line 7565
    break;
   } else {
    $$06 = $10; //@line 7568
   }
  }
 }
 return $$0$lcssa | 0; //@line 7572
}
function ___cxa_is_pointer_type($0) {
 $0 = $0 | 0;
 var $2 = 0, $3 = 0, $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10453
 do {
  if (!$0) {
   $3 = 0; //@line 10457
  } else {
   $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 10459
   $2 = ___dynamic_cast($0, 24, 80, 0) | 0; //@line 10460
   if (___async) {
    HEAP32[$AsyncCtx >> 2] = 71; //@line 10463
    sp = STACKTOP; //@line 10464
    return 0; //@line 10465
   } else {
    _emscripten_free_async_context($AsyncCtx | 0); //@line 10467
    $3 = ($2 | 0) != 0 & 1; //@line 10470
    break;
   }
  }
 } while (0);
 return $3 | 0; //@line 10475
}
function _invoke_ticker__async_cb_18($0) {
 $0 = $0 | 0;
 var $5 = 0, $6 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 11185
 $5 = HEAP32[HEAP32[HEAP32[$0 + 4 >> 2] >> 2] >> 2] | 0; //@line 11191
 $6 = HEAP32[$0 + 8 >> 2] | 0; //@line 11192
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 11193
 FUNCTION_TABLE_vi[$5 & 127]($6); //@line 11194
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 46; //@line 11197
  sp = STACKTOP; //@line 11198
  return;
 }
 ___async_unwind = 0; //@line 11201
 HEAP32[$ReallocAsyncCtx >> 2] = 46; //@line 11202
 sp = STACKTOP; //@line 11203
 return;
}
function _getint_671($0) {
 $0 = $0 | 0;
 var $$0$lcssa = 0, $$04 = 0, $11 = 0, $12 = 0, $7 = 0;
 if (!(_isdigit(HEAP8[HEAP32[$0 >> 2] >> 0] | 0) | 0)) {
  $$0$lcssa = 0; //@line 7194
 } else {
  $$04 = 0; //@line 7196
  while (1) {
   $7 = HEAP32[$0 >> 2] | 0; //@line 7199
   $11 = ($$04 * 10 | 0) + -48 + (HEAP8[$7 >> 0] | 0) | 0; //@line 7203
   $12 = $7 + 1 | 0; //@line 7204
   HEAP32[$0 >> 2] = $12; //@line 7205
   if (!(_isdigit(HEAP8[$12 >> 0] | 0) | 0)) {
    $$0$lcssa = $11; //@line 7211
    break;
   } else {
    $$04 = $11; //@line 7214
   }
  }
 }
 return $$0$lcssa | 0; //@line 7218
}
function ___fflush_unlocked__async_cb_19($0) {
 $0 = $0 | 0;
 var $10 = 0, $4 = 0, $6 = 0, $8 = 0;
 $4 = HEAP32[$0 + 8 >> 2] | 0; //@line 11313
 $6 = HEAP32[$0 + 12 >> 2] | 0; //@line 11315
 $8 = HEAP32[$0 + 16 >> 2] | 0; //@line 11317
 $10 = HEAP32[$0 + 20 >> 2] | 0; //@line 11319
 HEAP32[(HEAP32[$0 + 4 >> 2] | 0) + 16 >> 2] = 0; //@line 11321
 HEAP32[$4 >> 2] = 0; //@line 11322
 HEAP32[$6 >> 2] = 0; //@line 11323
 HEAP32[$8 >> 2] = 0; //@line 11324
 HEAP32[$10 >> 2] = 0; //@line 11325
 HEAP32[___async_retval >> 2] = 0; //@line 11327
 return;
}
function _mbed_vtracef__async_cb_24($0) {
 $0 = $0 | 0;
 var $1 = 0, $ReallocAsyncCtx3 = 0, sp = 0;
 sp = STACKTOP; //@line 12198
 $1 = HEAP32[36] | 0; //@line 12199
 $ReallocAsyncCtx3 = _emscripten_realloc_async_context(4) | 0; //@line 12200
 FUNCTION_TABLE_vi[$1 & 127](952); //@line 12201
 if (___async) {
  HEAP32[$ReallocAsyncCtx3 >> 2] = 12; //@line 12204
  sp = STACKTOP; //@line 12205
  return;
 }
 ___async_unwind = 0; //@line 12208
 HEAP32[$ReallocAsyncCtx3 >> 2] = 12; //@line 12209
 sp = STACKTOP; //@line 12210
 return;
}
function _serial_putc__async_cb_1($0) {
 $0 = $0 | 0;
 var $2 = 0, $ReallocAsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 10494
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 10496
 $ReallocAsyncCtx = _emscripten_realloc_async_context(4) | 0; //@line 10497
 _fflush($2) | 0; //@line 10498
 if (___async) {
  HEAP32[$ReallocAsyncCtx >> 2] = 44; //@line 10501
  sp = STACKTOP; //@line 10502
  return;
 }
 ___async_unwind = 0; //@line 10505
 HEAP32[$ReallocAsyncCtx >> 2] = 44; //@line 10506
 sp = STACKTOP; //@line 10507
 return;
}
function _emscripten_async_resume() {
 ___async = 0; //@line 13467
 ___async_unwind = 1; //@line 13468
 while (1) {
  if (!___async_cur_frame) return;
  dynCall_vi(HEAP32[___async_cur_frame + 8 >> 2] | 0, ___async_cur_frame + 8 | 0); //@line 13474
  if (___async) return;
  if (!___async_unwind) {
   ___async_unwind = 1; //@line 13478
   continue;
  }
  stackRestore(HEAP32[___async_cur_frame + 4 >> 2] | 0); //@line 13482
  ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 13484
 }
}
function ___stdio_close($0) {
 $0 = $0 | 0;
 var $5 = 0, $vararg_buffer = 0, sp = 0;
 sp = STACKTOP; //@line 4817
 STACKTOP = STACKTOP + 16 | 0; //@line 4818
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(16); //@line 4818
 $vararg_buffer = sp; //@line 4819
 HEAP32[$vararg_buffer >> 2] = _dummy(HEAP32[$0 + 60 >> 2] | 0) | 0; //@line 4823
 $5 = ___syscall_ret(___syscall6(6, $vararg_buffer | 0) | 0) | 0; //@line 4825
 STACKTOP = sp; //@line 4826
 return $5 | 0; //@line 4826
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 var $rem = 0, __stackBase__ = 0;
 __stackBase__ = STACKTOP; //@line 13409
 STACKTOP = STACKTOP + 16 | 0; //@line 13410
 $rem = __stackBase__ | 0; //@line 13411
 ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0; //@line 13412
 STACKTOP = __stackBase__; //@line 13413
 return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0; //@line 13414
}
function _llvm_cttz_i32(x) {
 x = x | 0;
 var ret = 0;
 ret = HEAP8[cttz_i8 + (x & 255) >> 0] | 0; //@line 13179
 if ((ret | 0) < 8) return ret | 0; //@line 13180
 ret = HEAP8[cttz_i8 + (x >> 8 & 255) >> 0] | 0; //@line 13181
 if ((ret | 0) < 8) return ret + 8 | 0; //@line 13182
 ret = HEAP8[cttz_i8 + (x >> 16 & 255) >> 0] | 0; //@line 13183
 if ((ret | 0) < 8) return ret + 16 | 0; //@line 13184
 return (HEAP8[cttz_i8 + (x >>> 24) >> 0] | 0) + 24 | 0; //@line 13185
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, $5) | 0) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0, $1, $2, $3, $4); //@line 9838
 }
 return;
}
function _sn_write($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $$ = 0, $5 = 0, $6 = 0, $7 = 0;
 $5 = $0 + 20 | 0; //@line 9636
 $6 = HEAP32[$5 >> 2] | 0; //@line 9637
 $7 = (HEAP32[$0 + 16 >> 2] | 0) - $6 | 0; //@line 9638
 $$ = $7 >>> 0 > $2 >>> 0 ? $2 : $7; //@line 9640
 _memcpy($6 | 0, $1 | 0, $$ | 0) | 0; //@line 9642
 HEAP32[$5 >> 2] = (HEAP32[$5 >> 2] | 0) + $$; //@line 9645
 return $2 | 0; //@line 9646
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0, $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11335
 if ((HEAP32[$2 + 24 >> 2] | 0) == 1) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[$2 + 16 >> 2]; //@line 11346
  $$0 = 1; //@line 11347
 } else {
  $$0 = 0; //@line 11349
 }
 HEAP8[___async_retval >> 0] = $$0 & 1; //@line 11353
 return;
}
function _vsnprintf__async_cb($0) {
 $0 = $0 | 0;
 var $13 = 0, $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 10990
 if (HEAP32[$0 + 4 >> 2] | 0) {
  $13 = HEAP32[HEAP32[$0 + 16 >> 2] >> 2] | 0; //@line 10993
  HEAP8[$13 + ((($13 | 0) == (HEAP32[HEAP32[$0 + 20 >> 2] >> 2] | 0)) << 31 >> 31) >> 0] = 0; //@line 10998
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 11001
 return;
}
function _serial_init($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 var $10 = 0, $4 = 0, $9 = 0;
 HEAP32[$0 + 4 >> 2] = $2; //@line 1518
 HEAP32[$0 >> 2] = $1; //@line 1519
 HEAP32[1002] = 1; //@line 1520
 $4 = $0; //@line 1521
 $9 = HEAP32[$4 + 4 >> 2] | 0; //@line 1526
 $10 = 4012; //@line 1527
 HEAP32[$10 >> 2] = HEAP32[$4 >> 2]; //@line 1529
 HEAP32[$10 + 4 >> 2] = $9; //@line 1532
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 if (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, HEAP32[$1 + 8 >> 2] | 0, 0) | 0) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0, $1, $2, $3); //@line 9914
 }
 return;
}
function _wait_ms($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 1622
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 1623
 _emscripten_sleep($0 | 0); //@line 1624
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 47; //@line 1627
  sp = STACKTOP; //@line 1628
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 1631
  return;
 }
}
function _mbed_trace_default_print($0) {
 $0 = $0 | 0;
 var $AsyncCtx = 0, sp = 0;
 sp = STACKTOP; //@line 227
 $AsyncCtx = _emscripten_alloc_async_context(4, sp) | 0; //@line 228
 _puts($0) | 0; //@line 229
 if (___async) {
  HEAP32[$AsyncCtx >> 2] = 7; //@line 232
  sp = STACKTOP; //@line 233
  return;
 } else {
  _emscripten_free_async_context($AsyncCtx | 0); //@line 236
  return;
 }
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0, $1, $2, $3) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 var $7 = 0;
 if ((HEAP32[$1 + 4 >> 2] | 0) == ($2 | 0)) {
  $7 = $1 + 28 | 0; //@line 9978
  if ((HEAP32[$7 >> 2] | 0) != 1) {
   HEAP32[$7 >> 2] = $3; //@line 9982
  }
 }
 return;
}
function _emscripten_alloc_async_context(len, sp) {
 len = len | 0;
 sp = sp | 0;
 var new_frame = 0;
 new_frame = stackAlloc(len + 8 | 0) | 0; //@line 13443
 HEAP32[new_frame + 4 >> 2] = sp; //@line 13445
 HEAP32[new_frame >> 2] = ___async_cur_frame; //@line 13447
 ___async_cur_frame = new_frame; //@line 13448
 return ___async_cur_frame + 8 | 0; //@line 13449
}
function ___cxa_can_catch__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP8[___async_retval >> 0] & 1; //@line 11218
 if ($AsyncRetVal) {
  HEAP32[HEAP32[$0 + 8 >> 2] >> 2] = HEAP32[HEAP32[$0 + 4 >> 2] >> 2]; //@line 11222
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal & 1; //@line 11225
 return;
}
function _bitshift64Shl(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high << bits | (low & (1 << bits) - 1 << 32 - bits) >>> 32 - bits; //@line 13432
  return low << bits; //@line 13433
 }
 tempRet0 = low << bits - 32; //@line 13435
 return 0; //@line 13436
}
function _bitshift64Lshr(low, high, bits) {
 low = low | 0;
 high = high | 0;
 bits = bits | 0;
 if ((bits | 0) < 32) {
  tempRet0 = high >>> bits; //@line 13421
  return low >>> bits | (high & (1 << bits) - 1) << 32 - bits; //@line 13422
 }
 tempRet0 = 0; //@line 13424
 return high >>> bits - 32 | 0; //@line 13425
}
function _fflush__async_cb_36($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 13065
 if (!(HEAP8[$0 + 4 >> 0] & 1)) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 13067
 }
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 13070
 return;
}
function stackAlloc(size) {
 size = size | 0;
 var ret = 0;
 ret = STACKTOP; //@line 4
 STACKTOP = STACKTOP + size | 0; //@line 5
 STACKTOP = STACKTOP + 15 & -16; //@line 6
 if ((STACKTOP | 0) >= (STACK_MAX | 0)) abortStackOverflow(size | 0); //@line 7
 return ret | 0; //@line 9
}
function _puts__async_cb($0) {
 $0 = $0 | 0;
 var $$lobit = 0;
 $$lobit = HEAP32[___async_retval >> 2] >> 31; //@line 11040
 if (HEAP32[$0 + 4 >> 2] | 0) {
  ___unlockfile(HEAP32[$0 + 8 >> 2] | 0); //@line 11043
 }
 HEAP32[___async_retval >> 2] = $$lobit; //@line 11046
 return;
}
function _main__async_cb($0) {
 $0 = $0 | 0;
 var $2 = 0;
 $2 = HEAP32[$0 + 4 >> 2] | 0; //@line 11233
 HEAP32[$2 >> 2] = HEAP32[___async_retval >> 2]; //@line 11238
 _mbed_tracef(16, 1292, 1373, $2); //@line 11239
 HEAP32[___async_retval >> 2] = 0; //@line 11241
 return;
}
function ___overflow__async_cb($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ((HEAP32[___async_retval >> 2] | 0) == 1) {
  $$0 = HEAPU8[HEAP32[$0 + 4 >> 2] >> 0] | 0; //@line 11022
 } else {
  $$0 = -1; //@line 11024
 }
 HEAP32[___async_retval >> 2] = $$0; //@line 11027
 return;
}
function ___lctrans_impl($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$1) {
  $$0 = 0; //@line 5524
 } else {
  $$0 = ___mo_lookup(HEAP32[$1 >> 2] | 0, HEAP32[$1 + 4 >> 2] | 0, $0) | 0; //@line 5530
 }
 return ($$0 | 0 ? $$0 : $0) | 0; //@line 5534
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 a6 = a6 | 0;
 FUNCTION_TABLE_viiiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0); //@line 13691
}
function _emscripten_free_async_context(ctx) {
 ctx = ctx | 0;
 assert((___async_cur_frame + 8 | 0) == (ctx | 0) | 0); //@line 13455
 stackRestore(___async_cur_frame | 0); //@line 13456
 ___async_cur_frame = HEAP32[___async_cur_frame >> 2] | 0; //@line 13457
}
function _putc__async_cb($0) {
 $0 = $0 | 0;
 var $AsyncRetVal = 0;
 $AsyncRetVal = HEAP32[___async_retval >> 2] | 0; //@line 11070
 ___unlockfile(HEAP32[$0 + 4 >> 2] | 0); //@line 11071
 HEAP32[___async_retval >> 2] = $AsyncRetVal; //@line 11073
 return;
}
function _gpio_init_out($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 HEAP32[$0 >> 2] = $1; //@line 1494
 if (($1 | 0) == -1) {
  return;
 }
 HEAP32[$0 + 4 >> 2] = $1; //@line 1500
 _emscripten_asm_const_iii(2, $0 | 0, $1 | 0) | 0; //@line 1501
 return;
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0;
 HEAPF64[tempDoublePtr >> 3] = $0; //@line 8635
 $1 = HEAP32[tempDoublePtr >> 2] | 0; //@line 8635
 tempRet0 = HEAP32[tempDoublePtr + 4 >> 2] | 0; //@line 8637
 return $1 | 0; //@line 8638
}
function _i64Subtract(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var h = 0;
 h = b - d >>> 0; //@line 13172
 h = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0; //@line 13173
 return (tempRet0 = h, a - c >>> 0 | 0) | 0; //@line 13174
}
function ___syscall_ret($0) {
 $0 = $0 | 0;
 var $$0 = 0;
 if ($0 >>> 0 > 4294963200) {
  HEAP32[(___errno_location() | 0) >> 2] = 0 - $0; //@line 4983
  $$0 = -1; //@line 4984
 } else {
  $$0 = $0; //@line 4986
 }
 return $$0 | 0; //@line 4988
}
function runPostSets() {}
function _i64Add(a, b, c, d) {
 a = a | 0;
 b = b | 0;
 c = c | 0;
 d = d | 0;
 var l = 0;
 l = a + c >>> 0; //@line 13164
 return (tempRet0 = b + d + (l >>> 0 < a >>> 0 | 0) >>> 0, l | 0) | 0; //@line 13166
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 a5 = a5 | 0;
 FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0); //@line 13684
}
function _handle_lora_downlink($0, $1, $2, $3, $4, $5) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 $3 = $3 | 0;
 $4 = $4 | 0;
 $5 = $5 | 0;
 __ZN16SX1276_LoRaRadio8rx_frameEPhjjhh($0, $1, $2, $3, $4, $5); //@line 56
 return;
}
function dynCall_viiii(index, a1, a2, a3, a4) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 a4 = a4 | 0;
 FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0); //@line 13677
}
function _strchr($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = ___strchrnul($0, $1) | 0; //@line 5669
 return ((HEAP8[$2 >> 0] | 0) == ($1 & 255) << 24 >> 24 ? $2 : 0) | 0; //@line 5674
}
function _wctomb($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $$0 = 0;
 if (!$0) {
  $$0 = 0; //@line 7695
 } else {
  $$0 = _wcrtomb($0, $1, 0) | 0; //@line 7698
 }
 return $$0 | 0; //@line 7700
}
function dynCall_iiii(index, a1, a2, a3) {
 index = index | 0;
 a1 = a1 | 0;
 a2 = a2 | 0;
 a3 = a3 | 0;
 return FUNCTION_TABLE_iiii[index & 7](a1 | 0, a2 | 0, a3 | 0) | 0; //@line 13656
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
 $a$0 = $a$0 | 0;
 $a$1 = $a$1 | 0;
 $b$0 = $b$0 | 0;
 $b$1 = $b$1 | 0;
 return ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0; //@line 13401
}
function ___dynamic_cast__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[HEAP32[$0 + 4 >> 2] >> 2] | 0) == 1 ? HEAP32[$0 + 8 >> 2] | 0 : 0; //@line 12894
 return;
}
function _fputs($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $2 = 0;
 $2 = _strlen($0) | 0; //@line 5164
 return ((_fwrite($0, 1, $2, $1) | 0) != ($2 | 0)) << 31 >> 31 | 0; //@line 5168
}
function _emscripten_realloc_async_context(len) {
 len = len | 0;
 stackRestore(___async_cur_frame | 0); //@line 13462
 return (stackAlloc(len + 8 | 0) | 0) + 8 | 0; //@line 13463
}
function establishStackSpace(stackBase, stackMax) {
 stackBase = stackBase | 0;
 stackMax = stackMax | 0;
 STACKTOP = stackBase; //@line 21
 STACK_MAX = stackMax; //@line 22
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 10200
 __ZdlPv($0); //@line 10201
 return;
}
function _swapc($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 var $3 = 0;
 $3 = _llvm_bswap_i32($0 | 0) | 0; //@line 5660
 return (($1 | 0) == 0 ? $0 : $3) | 0; //@line 5662
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0 | 0;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0); //@line 9728
 __ZdlPv($0); //@line 9729
 return;
}
function ___cxa_is_pointer_type__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = (HEAP32[___async_retval >> 2] | 0) != 0 & 1; //@line 11479
 return;
}
function setThrew(threw, value) {
 threw = threw | 0;
 value = value | 0;
 if (!__THREW__) {
  __THREW__ = threw; //@line 32
  threwValue = value; //@line 33
 }
}
function _out_670($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 if (!(HEAP32[$0 >> 2] & 32)) {
  ___fwritex($1, $2, $0) | 0; //@line 7180
 }
 return;
}
function b76(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(3); //@line 13899
}
function b75(p0, p1, p2, p3, p4, p5) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 p5 = p5 | 0;
 nullFunc_viiiiii(0); //@line 13896
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0, $1, $2) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 $2 = $2 | 0;
 return ($0 | 0) == ($1 | 0) | 0; //@line 9925
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _llvm_bswap_i32(x) {
 x = x | 0;
 return (x & 255) << 24 | (x >> 8 & 255) << 16 | (x >> 16 & 255) << 8 | x >>> 24 | 0; //@line 13489
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_21($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function b73(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(3); //@line 13893
}
function b72(p0, p1, p2, p3, p4) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 p4 = p4 | 0;
 nullFunc_viiiii(0); //@line 13890
}
function _fflush__async_cb_37($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 13080
 return;
}
function _strerror($0) {
 $0 = $0 | 0;
 return ___strerror_l($0, HEAP32[(___pthread_self_85() | 0) + 188 >> 2] | 0) | 0; //@line 7643
}
function _snprintf__async_cb($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 12981
 return;
}
function _putc__async_cb_17($0) {
 $0 = $0 | 0;
 HEAP32[___async_retval >> 2] = HEAP32[___async_retval >> 2]; //@line 11083
 return;
}
function dynCall_ii(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 return FUNCTION_TABLE_ii[index & 1](a1 | 0) | 0; //@line 13649
}
function b7(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(7); //@line 13707
 return 0; //@line 13707
}
function b6(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(6); //@line 13704
 return 0; //@line 13704
}
function b5(p0, p1, p2) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 nullFunc_iiii(0); //@line 13701
 return 0; //@line 13701
}
function dynCall_vi(index, a1) {
 index = index | 0;
 a1 = a1 | 0;
 FUNCTION_TABLE_vi[index & 127](a1 | 0); //@line 13670
}
function b70(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(3); //@line 13887
}
function b69(p0, p1, p2, p3) {
 p0 = p0 | 0;
 p1 = p1 | 0;
 p2 = p2 | 0;
 p3 = p3 | 0;
 nullFunc_viiii(0); //@line 13884
}
function ___lctrans($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
 return ___lctrans_impl($0, $1) | 0; //@line 8888
}
function dynCall_i(index) {
 index = index | 0;
 return FUNCTION_TABLE_i[index & 0]() | 0; //@line 13642
}
function dynCall_v(index) {
 index = index | 0;
 FUNCTION_TABLE_v[index & 0](); //@line 13663
}
function _isdigit($0) {
 $0 = $0 | 0;
 return ($0 + -48 | 0) >>> 0 < 10 | 0; //@line 5041
}
function b3(p0) {
 p0 = p0 | 0;
 nullFunc_ii(0); //@line 13698
 return 0; //@line 13698
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0 | 0;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_lock() {
 ___lock(4584); //@line 5679
 return 4592; //@line 5680
}
function setTempRet0(value) {
 value = value | 0;
 tempRet0 = value; //@line 39
}
function _frexpl($0, $1) {
 $0 = +$0;
 $1 = $1 | 0;
 return +(+_frexp($0, $1));
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_910() {
 return _pthread_self() | 0; //@line 8809
}
function _mbed_trace_default_print__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___pthread_self_85() {
 return _pthread_self() | 0; //@line 8815
}
function stackRestore(top) {
 top = top | 0;
 STACKTOP = top; //@line 16
}
function b1() {
 nullFunc_i(0); //@line 13695
 return 0; //@line 13695
}
function __ZdlPv($0) {
 $0 = $0 | 0;
 _free($0); //@line 9715
 return;
}
function _mbed_assert_internal__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _handle_interrupt_in($0, $1) {
 $0 = $0 | 0;
 $1 = $1 | 0;
}
function _mbed_error_printf__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function ___ofl_unlock() {
 ___unlock(4584); //@line 5685
 return;
}
function b67(p0) {
 p0 = p0 | 0;
 nullFunc_vi(127); //@line 13881
}
function b66(p0) {
 p0 = p0 | 0;
 nullFunc_vi(126); //@line 13878
}
function b65(p0) {
 p0 = p0 | 0;
 nullFunc_vi(125); //@line 13875
}
function b64(p0) {
 p0 = p0 | 0;
 nullFunc_vi(124); //@line 13872
}
function b63(p0) {
 p0 = p0 | 0;
 nullFunc_vi(123); //@line 13869
}
function b62(p0) {
 p0 = p0 | 0;
 nullFunc_vi(122); //@line 13866
}
function b61(p0) {
 p0 = p0 | 0;
 nullFunc_vi(121); //@line 13863
}
function b60(p0) {
 p0 = p0 | 0;
 nullFunc_vi(120); //@line 13860
}
function b59(p0) {
 p0 = p0 | 0;
 nullFunc_vi(119); //@line 13857
}
function b58(p0) {
 p0 = p0 | 0;
 nullFunc_vi(118); //@line 13854
}
function b57(p0) {
 p0 = p0 | 0;
 nullFunc_vi(117); //@line 13851
}
function b56(p0) {
 p0 = p0 | 0;
 nullFunc_vi(116); //@line 13848
}
function b55(p0) {
 p0 = p0 | 0;
 nullFunc_vi(115); //@line 13845
}
function b54(p0) {
 p0 = p0 | 0;
 nullFunc_vi(114); //@line 13842
}
function b53(p0) {
 p0 = p0 | 0;
 nullFunc_vi(113); //@line 13839
}
function b52(p0) {
 p0 = p0 | 0;
 nullFunc_vi(112); //@line 13836
}
function b51(p0) {
 p0 = p0 | 0;
 nullFunc_vi(111); //@line 13833
}
function b50(p0) {
 p0 = p0 | 0;
 nullFunc_vi(110); //@line 13830
}
function b49(p0) {
 p0 = p0 | 0;
 nullFunc_vi(109); //@line 13827
}
function b48(p0) {
 p0 = p0 | 0;
 nullFunc_vi(108); //@line 13824
}
function b47(p0) {
 p0 = p0 | 0;
 nullFunc_vi(107); //@line 13821
}
function b46(p0) {
 p0 = p0 | 0;
 nullFunc_vi(106); //@line 13818
}
function b45(p0) {
 p0 = p0 | 0;
 nullFunc_vi(105); //@line 13815
}
function b44(p0) {
 p0 = p0 | 0;
 nullFunc_vi(104); //@line 13812
}
function b43(p0) {
 p0 = p0 | 0;
 nullFunc_vi(103); //@line 13809
}
function b42(p0) {
 p0 = p0 | 0;
 nullFunc_vi(102); //@line 13806
}
function b41(p0) {
 p0 = p0 | 0;
 nullFunc_vi(101); //@line 13803
}
function b40(p0) {
 p0 = p0 | 0;
 nullFunc_vi(100); //@line 13800
}
function b39(p0) {
 p0 = p0 | 0;
 nullFunc_vi(99); //@line 13797
}
function b38(p0) {
 p0 = p0 | 0;
 nullFunc_vi(98); //@line 13794
}
function b37(p0) {
 p0 = p0 | 0;
 nullFunc_vi(97); //@line 13791
}
function b36(p0) {
 p0 = p0 | 0;
 nullFunc_vi(96); //@line 13788
}
function b35(p0) {
 p0 = p0 | 0;
 nullFunc_vi(95); //@line 13785
}
function b34(p0) {
 p0 = p0 | 0;
 nullFunc_vi(94); //@line 13782
}
function b33(p0) {
 p0 = p0 | 0;
 nullFunc_vi(93); //@line 13779
}
function b32(p0) {
 p0 = p0 | 0;
 nullFunc_vi(92); //@line 13776
}
function b31(p0) {
 p0 = p0 | 0;
 nullFunc_vi(91); //@line 13773
}
function b30(p0) {
 p0 = p0 | 0;
 nullFunc_vi(90); //@line 13770
}
function b29(p0) {
 p0 = p0 | 0;
 nullFunc_vi(89); //@line 13767
}
function b28(p0) {
 p0 = p0 | 0;
 nullFunc_vi(88); //@line 13764
}
function b27(p0) {
 p0 = p0 | 0;
 nullFunc_vi(87); //@line 13761
}
function b26(p0) {
 p0 = p0 | 0;
 nullFunc_vi(86); //@line 13758
}
function b25(p0) {
 p0 = p0 | 0;
 nullFunc_vi(85); //@line 13755
}
function b24(p0) {
 p0 = p0 | 0;
 nullFunc_vi(84); //@line 13752
}
function b23(p0) {
 p0 = p0 | 0;
 nullFunc_vi(83); //@line 13749
}
function b22(p0) {
 p0 = p0 | 0;
 nullFunc_vi(82); //@line 13746
}
function b21(p0) {
 p0 = p0 | 0;
 nullFunc_vi(81); //@line 13743
}
function b20(p0) {
 p0 = p0 | 0;
 nullFunc_vi(80); //@line 13740
}
function b19(p0) {
 p0 = p0 | 0;
 nullFunc_vi(79); //@line 13737
}
function b18(p0) {
 p0 = p0 | 0;
 nullFunc_vi(78); //@line 13734
}
function b17(p0) {
 p0 = p0 | 0;
 nullFunc_vi(77); //@line 13731
}
function b16(p0) {
 p0 = p0 | 0;
 nullFunc_vi(76); //@line 13728
}
function b15(p0) {
 p0 = p0 | 0;
 nullFunc_vi(75); //@line 13725
}
function b14(p0) {
 p0 = p0 | 0;
 nullFunc_vi(74); //@line 13722
}
function b13(p0) {
 p0 = p0 | 0;
 nullFunc_vi(73); //@line 13719
}
function b12(p0) {
 p0 = p0 | 0;
 nullFunc_vi(72); //@line 13716
}
function _dummy($0) {
 $0 = $0 | 0;
 return $0 | 0; //@line 4999
}
function ___lockfile($0) {
 $0 = $0 | 0;
 return 0; //@line 5316
}
function b11(p0) {
 p0 = p0 | 0;
 nullFunc_vi(0); //@line 13713
}
function _invoke_ticker__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _serial_putc__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function _mbed_tracef__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0 | 0;
 return;
}
function getTempRet0() {
 return tempRet0 | 0; //@line 42
}
function ___errno_location() {
 return 4580; //@line 4993
}
function _wait_ms__async_cb($0) {
 $0 = $0 | 0;
 return;
}
function stackSave() {
 return STACKTOP | 0; //@line 12
}
function _core_util_critical_section_enter() {
 return;
}
function _core_util_critical_section_exit() {
 return;
}
function _pthread_self() {
 return 292; //@line 5046
}
function ___unlockfile($0) {
 $0 = $0 | 0;
 return;
}
function setAsync() {
 ___async = 1; //@line 26
}
function b9() {
 nullFunc_v(0); //@line 13710
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1];
var FUNCTION_TABLE_ii = [b3,___stdio_close];
var FUNCTION_TABLE_iiii = [b5,___stdout_write,___stdio_seek,_sn_write,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,___stdio_write,b6,b7];
var FUNCTION_TABLE_v = [b9];
var FUNCTION_TABLE_vi = [b11,_mbed_trace_default_print,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,_mbed_trace_default_print__async_cb,_mbed_tracef__async_cb,_mbed_vtracef__async_cb,_mbed_vtracef__async_cb_34,_mbed_vtracef__async_cb_24,_mbed_vtracef__async_cb_25,_mbed_vtracef__async_cb_26,_mbed_vtracef__async_cb_33,_mbed_vtracef__async_cb_27,_mbed_vtracef__async_cb_32,_mbed_vtracef__async_cb_28,_mbed_vtracef__async_cb_29,_mbed_vtracef__async_cb_30,_mbed_vtracef__async_cb_31,_mbed_trace_array__async_cb,_mbed_assert_internal__async_cb,_mbed_die__async_cb_16,_mbed_die__async_cb_15,_mbed_die__async_cb_14,_mbed_die__async_cb_13,_mbed_die__async_cb_12,_mbed_die__async_cb_11
,_mbed_die__async_cb_10,_mbed_die__async_cb_9,_mbed_die__async_cb_8,_mbed_die__async_cb_7,_mbed_die__async_cb_6,_mbed_die__async_cb_5,_mbed_die__async_cb_4,_mbed_die__async_cb_3,_mbed_die__async_cb_2,_mbed_die__async_cb,_mbed_error_printf__async_cb,_mbed_error_vfprintf__async_cb,_mbed_error_vfprintf__async_cb_23,_mbed_error_vfprintf__async_cb_22,_serial_putc__async_cb_1,_serial_putc__async_cb,_invoke_ticker__async_cb_18,_invoke_ticker__async_cb,_wait_ms__async_cb,_main__async_cb,_putc__async_cb_17,_putc__async_cb,___overflow__async_cb,_fflush__async_cb_37,_fflush__async_cb_36,_fflush__async_cb_38,_fflush__async_cb,___fflush_unlocked__async_cb,___fflush_unlocked__async_cb_19,_vfprintf__async_cb
,_snprintf__async_cb,_vsnprintf__async_cb,_puts__async_cb,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb_20,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv__async_cb,___dynamic_cast__async_cb,___dynamic_cast__async_cb_35,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib__async_cb_21,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi__async_cb,___cxa_can_catch__async_cb,___cxa_is_pointer_type__async_cb,b12,b13,b14,b15,b16,b17,b18,b19,b20,b21,b22,b23,b24,b25,b26,b27,b28
,b29,b30,b31,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,b52,b53,b54,b55,b56,b57,b58
,b59,b60,b61,b62,b63,b64,b65,b66,b67];
var FUNCTION_TABLE_viiii = [b69,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b70];
var FUNCTION_TABLE_viiiii = [b72,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b73];
var FUNCTION_TABLE_viiiiii = [b75,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b76];

  return { ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_alloc_async_context: _emscripten_alloc_async_context, _emscripten_async_resume: _emscripten_async_resume, _emscripten_free_async_context: _emscripten_free_async_context, _emscripten_realloc_async_context: _emscripten_realloc_async_context, _fflush: _fflush, _free: _free, _handle_interrupt_in: _handle_interrupt_in, _handle_lora_downlink: _handle_lora_downlink, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _invoke_ticker: _invoke_ticker, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setAsync: setAsync, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_can_catch.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_is_pointer_type.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____errno_location.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____udivdi3.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____uremdi3.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Lshr.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Shl.apply(null, arguments);
};

var real__emscripten_alloc_async_context = asm["_emscripten_alloc_async_context"]; asm["_emscripten_alloc_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_alloc_async_context.apply(null, arguments);
};

var real__emscripten_async_resume = asm["_emscripten_async_resume"]; asm["_emscripten_async_resume"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_async_resume.apply(null, arguments);
};

var real__emscripten_free_async_context = asm["_emscripten_free_async_context"]; asm["_emscripten_free_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_free_async_context.apply(null, arguments);
};

var real__emscripten_realloc_async_context = asm["_emscripten_realloc_async_context"]; asm["_emscripten_realloc_async_context"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_realloc_async_context.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__fflush.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real__handle_interrupt_in = asm["_handle_interrupt_in"]; asm["_handle_interrupt_in"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__handle_interrupt_in.apply(null, arguments);
};

var real__handle_lora_downlink = asm["_handle_lora_downlink"]; asm["_handle_lora_downlink"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__handle_lora_downlink.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Add.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Subtract.apply(null, arguments);
};

var real__invoke_ticker = asm["_invoke_ticker"]; asm["_invoke_ticker"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__invoke_ticker.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_bswap_i32.apply(null, arguments);
};

var real__main = asm["_main"]; asm["_main"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__main.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__sbrk.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_establishStackSpace.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_getTempRet0.apply(null, arguments);
};

var real_setAsync = asm["setAsync"]; asm["setAsync"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setAsync.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setTempRet0.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setThrew.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _emscripten_alloc_async_context = Module["_emscripten_alloc_async_context"] = asm["_emscripten_alloc_async_context"];
var _emscripten_async_resume = Module["_emscripten_async_resume"] = asm["_emscripten_async_resume"];
var _emscripten_free_async_context = Module["_emscripten_free_async_context"] = asm["_emscripten_free_async_context"];
var _emscripten_realloc_async_context = Module["_emscripten_realloc_async_context"] = asm["_emscripten_realloc_async_context"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var _free = Module["_free"] = asm["_free"];
var _handle_interrupt_in = Module["_handle_interrupt_in"] = asm["_handle_interrupt_in"];
var _handle_lora_downlink = Module["_handle_lora_downlink"] = asm["_handle_lora_downlink"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _invoke_ticker = Module["_invoke_ticker"] = asm["_invoke_ticker"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _main = Module["_main"] = asm["_main"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memset = Module["_memset"] = asm["_memset"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var setAsync = Module["setAsync"] = asm["setAsync"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;

if (!Module["intArrayFromString"]) Module["intArrayFromString"] = function() { abort("'intArrayFromString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayToString"]) Module["intArrayToString"] = function() { abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["ccall"]) Module["ccall"] = function() { abort("'ccall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["cwrap"]) Module["cwrap"] = function() { abort("'cwrap' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["setValue"]) Module["setValue"] = function() { abort("'setValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getValue"]) Module["getValue"] = function() { abort("'getValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocate"]) Module["allocate"] = function() { abort("'allocate' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getMemory"]) Module["getMemory"] = function() { abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["Pointer_stringify"]) Module["Pointer_stringify"] = function() { abort("'Pointer_stringify' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["AsciiToString"]) Module["AsciiToString"] = function() { abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToAscii"]) Module["stringToAscii"] = function() { abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ArrayToString"]) Module["UTF8ArrayToString"] = function() { abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ToString"]) Module["UTF8ToString"] = function() { abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8Array"]) Module["stringToUTF8Array"] = function() { abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8"]) Module["stringToUTF8"] = function() { abort("'stringToUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF8"]) Module["lengthBytesUTF8"] = function() { abort("'lengthBytesUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF16ToString"]) Module["UTF16ToString"] = function() { abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF16"]) Module["stringToUTF16"] = function() { abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF16"]) Module["lengthBytesUTF16"] = function() { abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF32ToString"]) Module["UTF32ToString"] = function() { abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF32"]) Module["stringToUTF32"] = function() { abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF32"]) Module["lengthBytesUTF32"] = function() { abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocateUTF8"]) Module["allocateUTF8"] = function() { abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackTrace"]) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreRun"]) Module["addOnPreRun"] = function() { abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnInit"]) Module["addOnInit"] = function() { abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreMain"]) Module["addOnPreMain"] = function() { abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnExit"]) Module["addOnExit"] = function() { abort("'addOnExit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPostRun"]) Module["addOnPostRun"] = function() { abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeStringToMemory"]) Module["writeStringToMemory"] = function() { abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeArrayToMemory"]) Module["writeArrayToMemory"] = function() { abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeAsciiToMemory"]) Module["writeAsciiToMemory"] = function() { abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addRunDependency"]) Module["addRunDependency"] = function() { abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["removeRunDependency"]) Module["removeRunDependency"] = function() { abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS"]) Module["FS"] = function() { abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["FS_createFolder"]) Module["FS_createFolder"] = function() { abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPath"]) Module["FS_createPath"] = function() { abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDataFile"]) Module["FS_createDataFile"] = function() { abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPreloadedFile"]) Module["FS_createPreloadedFile"] = function() { abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLazyFile"]) Module["FS_createLazyFile"] = function() { abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLink"]) Module["FS_createLink"] = function() { abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDevice"]) Module["FS_createDevice"] = function() { abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_unlink"]) Module["FS_unlink"] = function() { abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["GL"]) Module["GL"] = function() { abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["staticAlloc"]) Module["staticAlloc"] = function() { abort("'staticAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynamicAlloc"]) Module["dynamicAlloc"] = function() { abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["warnOnce"]) Module["warnOnce"] = function() { abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadDynamicLibrary"]) Module["loadDynamicLibrary"] = function() { abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadWebAssemblyModule"]) Module["loadWebAssemblyModule"] = function() { abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getLEB"]) Module["getLEB"] = function() { abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFunctionTables"]) Module["getFunctionTables"] = function() { abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["alignFunctionTables"]) Module["alignFunctionTables"] = function() { abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["registerFunctions"]) Module["registerFunctions"] = function() { abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addFunction"]) Module["addFunction"] = function() { abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["removeFunction"]) Module["removeFunction"] = function() { abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFuncWrapper"]) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["prettyPrint"]) Module["prettyPrint"] = function() { abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["makeBigInt"]) Module["makeBigInt"] = function() { abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynCall"]) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getCompilerSetting"]) Module["getCompilerSetting"] = function() { abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };if (!Module["ALLOC_NORMAL"]) Object.defineProperty(Module, "ALLOC_NORMAL", { get: function() { abort("'ALLOC_NORMAL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STACK"]) Object.defineProperty(Module, "ALLOC_STACK", { get: function() { abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STATIC"]) Object.defineProperty(Module, "ALLOC_STATIC", { get: function() { abort("'ALLOC_STATIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_DYNAMIC"]) Object.defineProperty(Module, "ALLOC_DYNAMIC", { get: function() { abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_NONE"]) Object.defineProperty(Module, "ALLOC_NONE", { get: function() { abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });

if (memoryInitializer) {
  if (!isDataURI(memoryInitializer)) {
    if (typeof Module['locateFile'] === 'function') {
      memoryInitializer = Module['locateFile'](memoryInitializer);
    } else if (Module['memoryInitializerPrefixURL']) {
      memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
    }
  }
  if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
    var data = Module['readBinary'](memoryInitializer);
    HEAPU8.set(data, GLOBAL_BASE);
  } else {
    addRunDependency('memory initializer');
    var applyMemoryInitializer = function(data) {
      if (data.byteLength) data = new Uint8Array(data);
      for (var i = 0; i < data.length; i++) {
        assert(HEAPU8[GLOBAL_BASE + i] === 0, "area for memory initializer should not have been touched before it's loaded");
      }
      HEAPU8.set(data, GLOBAL_BASE);
      // Delete the typed array that contains the large blob of the memory initializer request response so that
      // we won't keep unnecessary memory lying around. However, keep the XHR object itself alive so that e.g.
      // its .status field can still be accessed later.
      if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
      removeRunDependency('memory initializer');
    }
    function doBrowserLoad() {
      Module['readAsync'](memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    }
    if (Module['memoryInitializerRequest']) {
      // a network request has already been created, just use that
      function useRequest() {
        var request = Module['memoryInitializerRequest'];
        var response = request.response;
        if (request.status !== 200 && request.status !== 0) {
            // If you see this warning, the issue may be that you are using locateFile or memoryInitializerPrefixURL, and defining them in JS. That
            // means that the HTML file doesn't know about them, and when it tries to create the mem init request early, does it to the wrong place.
            // Look in your browser's devtools network console to see what's going on.
            console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
            doBrowserLoad();
            return;
        }
        applyMemoryInitializer(response);
      }
      if (Module['memoryInitializerRequest'].response) {
        setTimeout(useRequest, 0); // it's already here; but, apply it asynchronously
      } else {
        Module['memoryInitializerRequest'].addEventListener('load', useRequest); // wait for it
      }
    } else {
      // fetch it from the network ourselves
      doBrowserLoad();
    }
  }
}



/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  var argv = stackAlloc((argc + 1) * 4);
  HEAP32[argv >> 2] = allocateUTF8OnStack(Module['thisProgram']);
  for (var i = 1; i < argc; i++) {
    HEAP32[(argv >> 2) + i] = allocateUTF8OnStack(args[i - 1]);
  }
  HEAP32[(argv >> 2) + argc] = 0;


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
      exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      var toLog = e;
      if (e && typeof e === 'object' && e.stack) {
        toLog = [e, e.stack];
      }
      Module.printErr('exception thrown: ' + toLog);
      Module['quit'](1, e);
    }
  } finally {
    calledMain = true;
  }
}




/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (runDependencies > 0) {
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = run;

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in NO_FILESYSTEM
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var print = Module['print'];
  var printErr = Module['printErr'];
  var has = false;
  Module['print'] = Module['printErr'] = function(x) {
    has = true;
  }
  try { // it doesn't matter if it fails
    var flush = flush_NO_FILESYSTEM;
    if (flush) flush(0);
  } catch(e) {}
  Module['print'] = print;
  Module['printErr'] = printErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set NO_EXIT_RUNTIME to 0 (see the FAQ), or make sure to emit a newline when you printf etc.');
  }
}

function exit(status, implicit) {
  checkUnflushedContent();

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      Module.printErr('exit(' + status + ') called, but NO_EXIT_RUNTIME is set, so halting execution but not exiting the runtime or preventing further async execution (build with NO_EXIT_RUNTIME=0, if you want a true shutdown)');
    }
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = exit;

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';
  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}

Module["noExitRuntime"] = true;

run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}






//# sourceMappingURL=trace.js.map