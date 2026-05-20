const NODE_FLAG_IN_QUEUE = 0b0001;
const NODE_FLAG_DIRTY    = 0b0010;
const NODE_VISITED       = 0b0100;

const NULL_REPR = 0xFFFFFFFF;
const NODE_FLAGS_OFFSET = 0;
const NODE_CALC_OFFSET = 1;
const NODE_VALUE_OFFSET = 2;
const NODE_PARENT_OFFSET = 3;
const NODE_HEAP_PREV_OFFSET = 4;
const NODE_HEAP_NEXT_OFFSET = 5;
const NODE_DEPS_HEAD_OFFSET = 7;
const NODE_DEPS_TAIL_OFFSET = 8;
const NODE_SUBS_HEAD_OFFSET = 9;
const NODE_SUBS_TAIL_OFFSET = 10;
const NODE_CLEANUP_OFFSET = 11;
const NODE_SIZE = 12;

const LINK_DEP_OFFSET = 0;
const LINK_SUB_OFFSET = 1;
const LINK_NEXT_DEP_OFFSET = 2;
const LINK_PREV_SUB_OFFSET = 3;
const LINK_NEXT_SUB_OFFSET = 4;
const LINK_SIZE = 5;

let nodeMemoryReserveSize = 1000 * NODE_SIZE;
let nodeMemorySize = 0;
let nodeMemory = new Uint32Array(nodeMemoryReserveSize);
let nodeFreeTableReserveSize = 1000;
let nodeFreeTableSize = 0;
let nodeFreeTable = new Uint32Array(nodeFreeTableReserveSize);
let linkMemoryReserveSize = 4000 * LINK_SIZE;
let linkMemorySize = 0;
let linkMemory = new Uint32Array(linkMemoryReserveSize);
let linkFreeTableReserveSize = 4000;
let linkFreeTableSize = 0;
let linkFreeTable = new Uint32Array(linkFreeTableReserveSize);
let owner: number | undefined = undefined;
let observer: number | undefined = undefined;
let queueHead: number | undefined = undefined;
let queueTail: number | undefined = undefined;

function allocNode(): number {
  if (nodeFreeTableSize > 0) {
    let ptr = nodeFreeTable[--nodeFreeTableSize];
    return ptr;
  }
  if (nodeMemorySize === nodeMemoryReserveSize) {
    let newReserveSize = nodeMemoryReserveSize << 1;
    let newNodeMemory = new Uint32Array(newReserveSize);
    for (let i = 0; i < nodeMemorySize; ++i) {
      newNodeMemory[i] = nodeMemory[i];
    }
  }
  let ptr = nodeMemorySize;
  nodeMemorySize += NODE_SIZE;
  return ptr;
}

function freeNode(ptr: number) {
  if (nodeFreeTableSize === nodeFreeTableReserveSize) {
    let newReserveSize = nodeFreeTableReserveSize << 1;
    let newNodeFreeTable = new Uint32Array(newReserveSize);
    for (let i = 0; i < nodeFreeTableSize; ++i) {
      newNodeFreeTable[i] = nodeFreeTable[i];
    }
    nodeFreeTable = newNodeFreeTable;
    nodeFreeTableReserveSize = newReserveSize;
  }
  nodeFreeTable[nodeFreeTableSize++] = ptr;
}

function allocLink(): number {
  if (linkFreeTableSize > 0) {
    let ptr = linkFreeTable[--linkFreeTableSize];
    return ptr;
  }
  if (linkMemorySize === linkMemoryReserveSize) {
    let newReserveSize = linkFreeTableReserveSize << 1;
    let newLinksMemory = new Uint32Array(newReserveSize);
    for (let i = 0; i < linkMemorySize; ++i) {
      newLinksMemory[i] = linkMemory[i];
    }
    linkMemory = newLinksMemory;
    linkMemoryReserveSize = newReserveSize;
  }
  let ptr = linkMemorySize;
  linkFreeTableSize += LINK_SIZE;
  return ptr;
}

function freeLink(ptr: number) {
  if (linkFreeTableSize === linkFreeTableReserveSize) {
    let newReserveSize = linkFreeTableReserveSize << 1;
    let newLinksFreeTable = new Uint32Array(newReserveSize);
    for (let i = 0; i < linkFreeTableSize; ++i) {
      newLinksFreeTable[i] = linkFreeTable[i];
    }
    linkFreeTable = newLinksFreeTable;
    linkFreeTableReserveSize = newReserveSize;
  }
  linkFreeTable[linkFreeTableSize++] = ptr;
}

let jsValueTable: any[] = [];
let freeJsValueTable: number[] = [];

function allocJsValue(jsValue: any): number {
  let ptr = freeJsValueTable.pop();
  if (ptr !== undefined) {
    jsValueTable[ptr] = jsValue;
    return ptr;
  }
  ptr = jsValueTable.length;
  jsValueTable.push(jsValue);
  return ptr;
}

function freeJsValue(ptr: number) {
  jsValueTable[ptr] = undefined;
  freeJsValueTable.push(ptr);
}

type Accessor<A> = number & { __accessor: A, };
type Signal<A> = number & { __signal: A, __accessor: A, };

function node(
  calcPtr: number,
  valuePtr: number,
): number {
  let nodePtr = allocNode();
  nodeMemory[nodePtr + NODE_FLAGS_OFFSET] = 0;
  nodeMemory[nodePtr + NODE_CALC_OFFSET] = calcPtr;
  nodeMemory[nodePtr + NODE_VALUE_OFFSET] = valuePtr;
  nodeMemory[nodePtr + NODE_PARENT_OFFSET] = NULL_REPR;
  nodeMemory[nodePtr + NODE_HEAP_PREV_OFFSET] = NULL_REPR;
  nodeMemory[nodePtr + NODE_HEAP_NEXT_OFFSET] = NULL_REPR;
  nodeMemory[nodePtr + NODE_DEPS_HEAD_OFFSET] = NULL_REPR;
  nodeMemory[nodePtr + NODE_DEPS_TAIL_OFFSET] = NULL_REPR;
  nodeMemory[nodePtr + NODE_SUBS_HEAD_OFFSET] = NULL_REPR;
  nodeMemory[nodePtr + NODE_SUBS_TAIL_OFFSET] = NULL_REPR;
  nodeMemory[nodePtr + NODE_CLEANUP_OFFSET] = NULL_REPR;
  return nodePtr;
}

function enqueueNode(nodePtr: number) {
  if (nodeMemory[nodePtr + NODE_FLAGS_OFFSET] & NODE_FLAG_IN_QUEUE) {
    return;
  }
  nodeMemory[nodePtr + NODE_FLAGS_OFFSET] |= NODE_FLAG_IN_QUEUE;
  if (queueHead === undefined) {
    queueHead = nodePtr;
    queueTail = nodePtr;
  } else {
    nodeMemory[queueTail! + NODE_HEAP_NEXT_OFFSET] = nodePtr;
    nodeMemory[nodePtr + NODE_HEAP_PREV_OFFSET] = queueTail!;
    queueTail = nodePtr;
  }
}

function dequeueNode(nodePtr: number) {
  if (nodeMemory[nodePtr + NODE_FLAGS_OFFSET] & ~NODE_FLAG_IN_QUEUE) {
    return;
  }
  nodeMemory[nodePtr + NODE_FLAGS_OFFSET] ^= NODE_FLAG_IN_QUEUE;
  let prevPtr = nodeMemory[nodePtr + NODE_HEAP_PREV_OFFSET];
  let nextPtr = nodeMemory[nodePtr + NODE_HEAP_NEXT_OFFSET];
  if (prevPtr !== NULL_REPR) {
    nodeMemory[prevPtr + NODE_HEAP_NEXT_OFFSET] = nextPtr;
  }
  if (nextPtr !== NULL_REPR) {
    nodeMemory[nextPtr + NODE_HEAP_PREV_OFFSET] = prevPtr;
  }
  if (queueHead === nodePtr) {
    queueHead = nextPtr === NULL_REPR ? undefined : nextPtr;
  }
  if (queueTail === nodePtr) {
    queueTail = prevPtr === NULL_REPR ? undefined : prevPtr;
  }
}

function signal<A>(init: A): Signal<A> {
  let nodePtr = node(
    NULL_REPR,
    allocJsValue(init),
  );
  return nodePtr as Signal<A>;
}

function memo<A>(fn: () => A): Accessor<A> {
  let nodePtr = node(
    allocJsValue(fn),
    NULL_REPR,
  );
  let lastOwner = owner;
  let lastObserver = observer;
  try {
    owner = nodePtr;
    observer = nodePtr;
    let initValue = fn();
    nodeMemory[nodePtr + NODE_VALUE_OFFSET] = allocJsValue(initValue);
  } finally {
    owner = lastOwner;
    observer = lastObserver;
  }
  return nodePtr as Accessor<A>;
}

function updateNode(nodePtr: number) {

}

function read<A>(a: Accessor<A>): A {
  let nodePtr = a;
  let valuePtr = nodeMemory[nodePtr + NODE_VALUE_OFFSET];
  return jsValueTable[valuePtr] as A;
}

function write<A>(signal: Signal<A>, value: A) {
  let valuePtr = nodeMemory[signal + NODE_VALUE_OFFSET];
  jsValueTable[valuePtr] = value;
}

function cleanup(fn: () => void) {
  if (owner === undefined) {
    fn();
    return;
  }
  let cleanupPtr = nodeMemory[owner + NODE_CLEANUP_OFFSET];
  if (cleanupPtr === NULL_REPR) {
    nodeMemory[owner + NODE_CLEANUP_OFFSET] = allocJsValue(fn);
  } else {
    let lastCleanup = jsValueTable[cleanupPtr];
    if (cleanup instanceof Function) {
      jsValueTable[cleanupPtr] = [
        lastCleanup,
        fn,
      ];
    } else {
      // the cleanups must be an array if we reach here
      (lastCleanup as any).push(fn);
    }
  }
}
