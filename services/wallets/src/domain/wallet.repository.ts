import { Wallet } from "./wallet.entity";

export interface WalletRepository {
  findByPlayerId(playerId: string): Promise<Wallet | null>;
  findById(id: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<Wallet>;
  createOrGet(playerId: string): Promise<{ wallet: Wallet; created: boolean }>;
}

export const WALLET_REPOSITORY = Symbol("WALLET_REPOSITORY");
