/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Helper to retrieve the translation key for a given Bitunix error code.
export function getBitunixErrorKey(code: number | string): string {
  const codeStr = String(code);
  const validCodes = [
    "10001",
    "10002",
    "10003",
    "10004",
    "10005",
    "10006",
    "10007",
    "10008",
    "20001",
    "20002",
    "20003",
    "20004",
    "20005",
    "20006",
    "20007",
    "20008",
    "20009",
    "20010",
    "20011",
    "20012",
    "20013",
    "20014",
    "20015",
    "20016",
    "30001",
    "30002",
    "30003",
    "30004",
    "30005",
    "30006",
    "30007",
    "30008",
    "30009",
    "30010",
    "30011",
    "30012",
    "30013",
    "30014",
    "30015",
    "30016",
    "30017",
    "30018",
    "30019",
    "30020",
    "30021",
    "30022",
    "30023",
    "30024",
    "30025",
    "30026",
    "30027",
    "30028",
    "30029",
    "30030",
    "30031",
    "30032",
    "30033",
    "30034",
    "30035",
    "30036",
    "30037",
    "30038",
    "30039",
    "30040",
    "30041",
    "30042",
  ];

  if (validCodes.includes(codeStr)) {
    return `bitunixErrors.${codeStr}`;
  }

  // Fallback if the code is not in our list
  return "apiErrors.generic";
}
