import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { Tendermint34Client } from "@cosmjs/tendermint-rpc";
import { QueryClient, setupBankExtension, Coin } from "@cosmjs/stargate";
import util from "util";
import { chains } from "chain-registry";
import fs from "fs";

// const
const APOLLO_CW3_ID = 1;
const USDC_IBC =
  "ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858";

// types
type SafeContract = {
  address: string;
  all_balances: Coin[];
};

type Totals = {
  wallet_count: number;
  usdc: number;
  uosmo: number;
};

type Report = {
  contracts: SafeContract[];
  totals: Totals;
};

// stores
let contract_store: SafeContract[] = [];

// output
let totals = {
  wallet_count: 0,
  uosmo: 0,
  usdc: 0,
} as Totals;

// utils
// - write file
const write_output = (report: Report) => {
  const data = JSON.stringify(report, null, 2);
  if (!data) return;
  fs.writeFile("report.json", data, "utf8", (err) => {
    if (err) {
      console.log(`Error writing file: ${err}`);
    } else {
      console.log(`File is written successfully!`);
    }
  });
};

// loops
// - fetch rpc url
const fetch_rpc_url = (chain_id: string): string => {
  const chain = chains.find((c) => c.chain_id === chain_id);
  if (!chain?.apis) throw new Error("no api found or chain not found");
  if (!chain.apis.rpc) throw new Error("no rpc nodes");
  return chain.apis.rpc[0].address;
};
// - fetch contract addresses
const fetch_contracts = async (
  client: CosmWasmClient
): Promise<readonly string[]> => {
  return await client.getContracts(APOLLO_CW3_ID);
};

// - fetch balances
const fetch_balances = async (
  contracts: readonly string[],
  rpc_url: string
) => {
  const tendermint = await Tendermint34Client.connect(rpc_url);
  const queryClient = new QueryClient(tendermint);
  const bank_extension = setupBankExtension(queryClient);
  console.log("fetching balances:");
  for (const ci in contracts) {
    const address = contracts[ci];
    console.log("address:", address);

    // sleep for 500ms - otherwise cloudflare gets angry
    await new Promise((res) => {
      setTimeout(res, 1000);
    });

    // todo loop/map all native tokens better.
    // fetch all balances then generate totals later
    try {
      const all_balances = await bank_extension.bank.allBalances(address);
      const uosmo_balance =
        all_balances.find((b) => b.denom === "uosmo") ||
        ({ amount: "0" } as Coin);
      const usdc_balance =
        all_balances.find((b) => b.denom === USDC_IBC) ||
        ({ amount: "0" } as Coin);
      //console.log("all_balances", all_balances);
      console.log("usdc balance", usdc_balance);
      totals.uosmo += Number(uosmo_balance.amount);
      totals.usdc += Number(usdc_balance.amount);
      contract_store.push({
        address,
        all_balances,
      });
    } catch (error) {
      console.log(error);
    }
  }
};

// main loop
const main = async () => {
  const rpc_url = fetch_rpc_url("osmosis-1");

  const client = await CosmWasmClient.connect(rpc_url);
  const contract_results = await fetch_contracts(client);
  totals.wallet_count = contract_results.length;
  await fetch_balances(contract_results, rpc_url);
  const report: Report = {
    contracts: contract_store,
    totals,
  };
  console.log(
    util.inspect(report, { showHidden: false, depth: null, colors: true })
  );
  write_output(report);
};

// run
main();
