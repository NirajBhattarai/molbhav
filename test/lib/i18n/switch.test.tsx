// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/i18n/catalog";
import { setLang, useT, useTx, type Text } from "@/lib/i18n";

/** A heading through t() and an error kept in state as English, like the app's screens. */
function Probe({ error }: { error: Text }) {
  const t = useT();
  const tx = useTx();
  return (
    <>
      <h1>{t("Check your menu")}</h1>
      <p role="alert">{tx(error)}</p>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  act(() => setLang("en"));
});

describe("changing the app language", () => {
  it("updates text on screen right away, including errors set earlier", () => {
    render(<Probe error="Give the item a name." />);
    expect(screen.getByRole("heading")).toHaveTextContent("Check your menu");

    act(() => setLang("hi"));
    expect(screen.getByRole("heading")).toHaveTextContent(CATALOG["Check your menu"].hi);
    expect(screen.getByRole("alert")).toHaveTextContent(CATALOG["Give the item a name."].hi);

    act(() => setLang("ja"));
    expect(screen.getByRole("heading")).toHaveTextContent(CATALOG["Check your menu"].ja);
  });

  it("follows a language picked in another tab", () => {
    render(<Probe error={{ msg: "Update ({n})", vars: { n: 2 } }} />);
    act(() => {
      localStorage.setItem("molbhav.lang", "es");
      window.dispatchEvent(new StorageEvent("storage", { key: "molbhav.lang", newValue: "es" }));
    });
    expect(screen.getByRole("heading")).toHaveTextContent(CATALOG["Check your menu"].es);
    expect(screen.getByRole("alert")).toHaveTextContent(
      CATALOG["Update ({n})"].es.replace("{n}", "2"),
    );
  });
});
