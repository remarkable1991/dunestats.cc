import { translateLeader } from "/dev-server/src/lib/leader-translate";
import { test, expect } from "vitest";
test("x",()=>{
 for (const s of ["Фейд-Раута Харконнен","Леді Марго Фенрінг","Стабан Туек","Гурні Галлек","Перемога",""]) console.log(s, "=>", translateLeader(s));
 expect(translateLeader("Перемога")).toBeNull();
});
