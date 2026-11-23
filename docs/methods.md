# Calculation notes

## Reference water demand

Daily reference evapotranspiration for short grass uses FAO Irrigation and Drainage Paper 56, Chapters 3 and 4. All radiation terms use MJ/m2/day, air temperature uses degrees Celsius, and vapor pressure uses kPa. The engine exposes intermediate terms, not just the final estimate.

| Quantity | FAO-56 equation and implementation |
| --- | --- |
| Atmospheric pressure and psychrometric constant | Eqs. 7 and 8. `P = 101.3 ((293 - 0.0065 z)/293)^5.26`, `gamma = 0.000665 P`. |
| Vapor pressure and slope | Eqs. 11 to 13 and 17. Approximate daily saturation as the mean of `e(Tmin)` and `e(Tmax)`, not `e(Tmean)`. Pair maximum RH with the minimum temperature. Evaluate the slope at the mean temperature. |
| Extraterrestrial radiation and daylight | Eqs. 21 to 25 and 34. Use the UTC civil day of year as the site date. Bound the sunset cosine to `[-1,1]` for polar geometry. |
| Incoming radiation | Use the supplied synthetic daily solar observation, or Eq. 35 with default Angstrom coefficients `0.25` and `0.50` if sunshine hours are supplied. |
| Clear-sky and net shortwave | Eqs. 37 and 38. `Rso = (0.75 + 2e-5 z) Ra`, `Rns = 0.77 Rs`. |
| Net outgoing longwave | Eq. 39. Use the mean of absolute temperatures to the fourth power, `sigma = 4.903e-9`, and the paper's humidity and cloud terms. Bound `Rs/Rso` above by one. In polar night only, set the undefined cloud term to zero as an explicit fallback. The cloud relation is empirical and extrapolation outside its usual shortwave range is not validated. |
| Net radiation and wind | Eq. 40 subtracts longwave from shortwave. Eq. 47 converts off-height wind to 2 m. |
| Daily reference ET | Use Eq. 6 with daily `G = 0` (Eq. 42). Report the unclipped value and restrict the operational atmospheric demand to nonnegative values. |

FAO-56 Example 18 uses measurements from Uccle on 6 July. The input is `Tmin = 12.3`, `Tmax = 21.5`, `RHmin = 63`, `RHmax = 84`, `wind = 10 km/h at 10 m`, `latitude = 50.8`, `elevation = 100 m`, `J = 187` and `sunshine = 9.25 h`. The published result is 3.88 mm/day before the paper rounds it to 3.9. Tests check the result and thirteen published intermediate values at their printed precision.

Two input paths are mutually exclusive: when an actual vapor pressure is supplied, the humidity fields are not consulted, and when a measured solar value is supplied, the sunshine field is not consulted. Under extreme heat and humidity, or with little sun, the humidity and cloud terms can push the unclipped estimate below zero; the raw value is still reported while the operational demand stays at zero. In polar night the cloud term falls back to zero, but a nonzero wind can still yield a small positive estimate through the aerodynamic term of the daily equation.

## Soil and crop response

Available water in millimeters is `TAW = 1000 (theta_FC - theta_WP) Zr`. Readily available water is `RAW = p TAW`, with the FAO-56 daily crop demand correction `p = clamp(p_table + 0.04 (5 - ETc), 0.1, 0.8)`. Potential crop ET is `Kc ET0`. The single-coefficient stress approximation scales crop ET by `Ks`, evaluated after the day's morning wetting and drainage; uptake cannot exceed remaining available water.

- The model applies irrigation and effective rain before ET. Effective rain excludes runoff beyond a per-plot daily infiltration limit. Morning input above field capacity drains immediately as deep percolation. This is an explicit within-day bucket assumption, not FAO's alternative end-of-day drainage calculation.
- The conservation identity is `Dr(end) - Dr(start) = ETa + DP - P_eff - I_net`. Depth, field capacity, wilting point and initial depletion stay fixed for the selected week. No groundwater rise, lateral exchange, surface ponding, or root growth is modeled. The terrace rice is upland, not a flooded paddy.
- A critical plot-day means end-of-day `Dr >= 0.90 TAW`. This is a scenario warning threshold, not an observed or predicted plant wilting event.
- The FAO-33 water-response function is `Ya/Ym = 1 - Ky (1 - sum(ETa)/sum(ETc))`, clipped to `[0,1]`. Treat the seven days as an illustrative stage exposure at one selected `Kc` and `Ky`. These values are representative inputs, not local recommendations. The resulting ratio is a window-based proxy, not a validated season yield. Severe deficits are outside the range where the linear approximation is generally reliable.
- Multiply the plot ratio by illustrative potential kg, edible calorie density or unit value. Farm indices divide the summed modeled outputs by their summed potential. No serving size, nutrition, income, or market forecast is implied.

The optional shock changes days 3 through 6. It raises daily minimum temperature by 2 C, raises maximum by 3 C, lowers the two RH values by 8 points, and keeps 15% of the original daily rainfall. Wind and incoming solar remain the same.

## Allocation

The pump delivers one 18 m3 gross lot in 36 minutes at 30 m3/hour. At most one lot per plot per day is allowed. The shared synthetic pump window allows at most two lots per day. Net root-zone depth is `gross m3 * 1000 * application efficiency / plot area in m2`. The weekly cap is rounded down to full lots, never up. Pump slots are sequential and in plot order each day.

Each plot has `2^7` possible on/off masks. The solver runs the nonlinear water balance for each mask and evaluates all feasible triples. Triples with too many weekly lots or too many concurrent daily lots are rejected. The maximum total modeled calories is exact for this finite schedule space. Equal objective values prefer less gross water, and any remaining ties take the first triple in ascending mask order. The baseline uses fixed crop dates, day order, and plot order while respecting the same quota and daily capacity. Yield loss avoided is a difference in percentage points of the farm kg index, not a percentage of baseline loss.

The quota frontier and stress lab reuses the same engine under five allocation rules over the same mask space: the fixed calendar; an equal split that gives each plot the same lot count apart from a remainder of one and keeps the highest-calorie feasible plan at the largest balanced total; the calorie-optimal plan; a wilting-guarded plan that minimizes critical plot-days first and then maximizes modeled calories; and a revenue-weighted plan that maximizes modeled value first. Every rule faces the same weekly lot budget and daily pump ceiling. The quota sweep re-solves the calorie-optimal plan at fixed percentages of the case quota, so the frontier is non-decreasing by construction; the cliff point marks the first quota where critical plot-days reach their minimum across the sweep. The lab brief digest is a SHA-256 over the canonical JSON payload and is a tamper check, not a signature.

This finite model does not claim optimality for arbitrary irrigation depths, multiple operations per plot on the same day, more plots, longer windows, multiple pumps, weather uncertainty, or another objective.

## References

- Allen, Pereira, Raes and Smith (1998). *Crop evapotranspiration*, FAO Irrigation and Drainage Paper 56. [Meteorological data](https://www.fao.org/4/x0490e/x0490e07.htm), [Determination of ETo and Example 18](https://www.fao.org/4/x0490e/x0490e08.htm), [ETc under soil water stress](https://www.fao.org/4/x0490e/x0490e0e.htm).
- Doorenbos and Kassam (1979). *Yield response to water*, FAO Irrigation and Drainage Paper 33. See the FAO 2012 [review of the original water production function](https://www.fao.org/4/i2800e/i2800e02.pdf).
- IETF (2009). [RFC 5545 iCalendar](https://www.rfc-editor.org/rfc/rfc5545), UTC timestamps, text escaping, line folding, and display alarms.
