/**
 * @module state
 * Gestão centralizada do estado da aplicação
 */

/** Estado global reativo */
export const state = {
  user: null,
  profile: null,
  moves: [],
  people: [],
  latestAll: new Map(),
  latestMine: new Map(),
  myRows: [],
  myPage: 1,
  selected: new Set(),
  selectedTeamUsers: new Set(),
  find: { rows: [], total: 0, page: 1, status: "idle" },
  promises: {},
  movesDirty: true,
  peopleDirty: true,
  allDirty: true,
  allLoaded: false,
  myDirty: true,
  myLoaded: false,
  specialMove: null,
  specialAssignments: new Set(),
  telePosData: new Map(),
  online: navigator.onLine
};

/** Contadores para evitar race conditions */
export const tokens = { mine: 0, team: 0, manage: 0, find: 0 };

/** Flags globais */
export const flags = {
  signupInProgress: false,
  passResolver: null,
  findTimer: null
};

/**
 * Invalida cache de manobras
 */
export const invalidateMoves = () => { state.movesDirty = true; };

/**
 * Invalida cache de pessoas
 */
export const invalidatePeople = () => { state.peopleDirty = true; };

/**
 * Invalida cache de todos os registos
 */
export const invalidateAllRegs = () => { state.allDirty = true; state.allLoaded = false; };

/**
 * Invalida cache dos meus registos
 */
export const invalidateMyRegs = () => { state.myDirty = true; state.myLoaded = false; };
