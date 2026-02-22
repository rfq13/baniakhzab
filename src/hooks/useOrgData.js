import rawData from "../../with-gender.json";

export default function useOrgData() {
  return { data: rawData, loading: false, error: "" };
}
