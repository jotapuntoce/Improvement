import { describe, expect, it } from "vitest";
import { errorCode, errorMessage } from "../server/error-codes.ts";

describe("error-codes", () => {
  it("WHEN el mensaje es conocido THE SYSTEM SHALL darle su código propio", () => {
    expect(errorCode("Necesita la firma del otro dueño.")).toBe("otra-firma");
    expect(errorCode("Este cambio ya se decidió.")).toBe("ya-decidido");
  });
  it("WHEN el mensaje no se reconoce THE SYSTEM SHALL caer en no-se-pudo", () => {
    expect(errorCode("algo raro")).toBe("no-se-pudo");
  });
  it("WHEN el código es desconocido o de prototipo THE SYSTEM SHALL ignorarlo", () => {
    expect(errorMessage("<b>hola</b>")).toBeUndefined();
    expect(errorMessage("constructor")).toBeUndefined();
    expect(errorMessage(undefined)).toBeUndefined();
  });
});
