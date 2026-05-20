const NULL_REPR = 0xFFFFFFFF;
const NODE_CALC_OFFSET = 0;
const NODE_PARENT_OFFSET = 1;
const NODE_PREV_OFFSET = 2;
const NODE_NEXT_OFFSET = 3;
const NODE_CHILDREN_HEAD = 4;
const NODE_CHILDREN_TAIL = 5;
const NODE_SIZE = 6;

let nodeMemoryReserveSize = 1000 * NODE_SIZE;
let nodeMemorySize = 0;
let nodeMemory = new Uint32Array(nodeMemoryReserveSize);
let nodeFreeTableReserveSize = 1000;
let nodeFreeTableSize = 0;
let nodeFreeTable = new Uint32Array(nodeFreeTableReserveSize);

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
