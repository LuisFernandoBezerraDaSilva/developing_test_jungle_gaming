import { Round } from "./round.entity";

export interface RoundRepository {
  findCurrent(): Promise<Round | null>;
  findById(id: string): Promise<Round | null>;
  findHistory(page: number, limit: number): Promise<{ rounds: Round[]; total: number }>;
  save(round: Round): Promise<void>;
  create(round: Round): Promise<void>;
  getNextNonce(): Promise<number>;
}

export const ROUND_REPOSITORY = Symbol("ROUND_REPOSITORY");
