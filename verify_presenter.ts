
import { TechnicalsPresenter } from "./src/utils/technicalsPresenter";

console.log("Format NaN:", TechnicalsPresenter.formatVal(NaN));
console.log("Format 0:", TechnicalsPresenter.formatVal(0));
console.log("Calc Width NaN:", TechnicalsPresenter.calculateBollingerBandWidth(NaN, NaN, NaN));
console.log("Calc Width 0:", TechnicalsPresenter.calculateBollingerBandWidth(100, 100, 100)); // Should be 0
console.log("Format Width(NaN):", TechnicalsPresenter.formatVal(TechnicalsPresenter.calculateBollingerBandWidth(NaN, NaN, NaN), 2));
console.log("Format Width(0):", TechnicalsPresenter.formatVal(TechnicalsPresenter.calculateBollingerBandWidth(100, 100, 100), 2));
