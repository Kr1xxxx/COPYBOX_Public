// The `@types/papaparse` package pulls in Node's global types, which this browser code must not see
// (tsconfig.typecheck.json sets `types: []`), so only the one call we use is declared here.
declare module "papaparse" {
  const Papa: {
    parse<Row>(input: string, config?: { skipEmptyLines?: boolean | "greedy" }): { data: Row[] };
  };
  export default Papa;
}
