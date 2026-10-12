import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomInt, randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const userIds = [];
const password = "Local-test-password-2026!";

async function unusedNip() {
  for (;;) {
    const prefix = randomInt(100000000, 999999999).toString();
    const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    const checksum = weights.reduce((sum, weight, index) => sum + weight * Number(prefix[index]), 0) % 11;
    if (checksum === 10) continue;
    const nip = `${prefix}${checksum}`;
    const { data, error } = await admin.from("organizations").select("id").eq("nip", nip);
    if (error) throw error;
    if (data.length === 0) return nip;
  }
}
async function createAccount() {
  const email = `e2e-${randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "Test lokalny" } });
  if (error) throw error;
  userIds.push(data.user.id);
  return { email, id: data.user.id };
}
async function login(page, email, secret = password) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Adres e-mail", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Hasło", exact: true }).fill(secret);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
}
async function signout(page) {
  await page.getByRole("button", { name: "Wyloguj", exact: true }).click();
  await expect(page.getByRole("button", { name: "Zaloguj się", exact: true })).toBeVisible();
}
async function tokenFor(email, secret = password) {
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: secret });
  if (error) throw error;
  return data.session.access_token;
}
async function fillBusiness(page, kind, nip) {
  await page.getByLabel(kind === "store" ? "Nazwa sklepu" : "Nazwa firmy", { exact: true }).fill(`E2E ${kind}`);
  await page.getByLabel("NIP", { exact: true }).fill(nip);
  await page.getByLabel("Telefon", { exact: true }).fill("123456789");
  await page.getByLabel("Miejscowość", { exact: true }).fill("Kraków");
  await page.getByLabel("Kod pocztowy", { exact: true }).fill("30-001");
  await page.getByLabel("Adres", { exact: true }).fill("Budowlana 1");
  await page.getByLabel("Branża i specjalizacja", { exact: true }).fill(kind === "store" ? "Materiały budowlane" : "Budowa domów");
  await page.getByLabel("Obszar działania", { exact: true }).fill("Małopolskie");
  await page.getByLabel("Opis działalności", { exact: true }).fill("Lokalna działalność testowa");
  await page.getByRole("button", { name: "Zapisz profil i przejdź do panelu" }).click();
  await expect(page.getByRole("heading", { name: `E2E ${kind}`, exact: true }).first()).toBeVisible();
}
async function fillConstruction(page, title) {
  await page.getByLabel("Nazwa budowy", { exact: true }).fill(title);
  await page.getByLabel("Miejscowość", { exact: true }).fill("Kraków");
  await page.getByLabel("Adres lub numer działki", { exact: true }).fill("Działka 42");
  await page.getByLabel("Powierzchnia (m²)", { exact: true }).fill("120");
  await page.getByLabel("Zakres prac", { exact: true }).fill("Fundamenty i stan surowy domu");
  await page.getByRole("button", { name: "Zapisz budowę i przejdź do panelu" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

test.afterEach(async () => {
  for (const id of userIds.splice(0).reverse()) {
    const { error: businessError } = await admin.from("organizations").delete().eq("created_by", id);
    if (businessError) throw businessError;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
});

test("client goes straight to construction, dashboard on next login and adds another job", async ({ page }) => {
  const account = await createAccount();
  await login(page, account.email);
  await expect(page.locator(".account-type-card")).toHaveCount(3);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await page.locator(".account-type-card").evaluateAll((cards) => {
      return {
        sameRow: cards.every((card) => card.offsetTop === cards[0].offsetTop),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        nestedButtons: cards.some((card) => !!card.querySelector("button")),
      };
    });
    expect(result).toEqual({ sameRow: true, overflow: false, nestedButtons: false });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".account-type-card.type-client .account-type-art").click();
  await expect(page.getByRole("heading", { name: "Opowiedz nam o swojej budowie" })).toBeVisible();
  await expect(page.getByText("Utwórz organizację", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("client-construction.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  const checkbox = await page.getByRole("checkbox", { name: "Budynek z piwnicą" }).boundingBox();
  expect(checkbox.width).toBeLessThanOrEqual(20);
  expect(checkbox.height).toBeLessThanOrEqual(20);
  await page.screenshot({ path: test.info().outputPath("client-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fillConstruction(page, "Pierwsza budowa");
  await page.getByRole("button", { name: "Edytuj", exact: true }).click();
  await page.getByLabel("Nazwa budowy", { exact: true }).fill("Pierwsza budowa po edycji");
  await page.getByRole("button", { name: "Zapisz budowę i przejdź do panelu" }).click();
  await expect(page.getByRole("heading", { name: "Pierwsza budowa po edycji" })).toBeVisible();
  await page.getByRole("button", { name: "Opublikuj", exact: true }).click();
  await expect(page.getByText("Opublikowane", { exact: true })).toBeVisible();
  await signout(page);
  await login(page, account.email);
  await expect(page.getByRole("heading", { name: "Twoje budowy i zlecenia" })).toBeVisible();
  await page.getByRole("button", { name: "+ Nowe zlecenie", exact: true }).click();
  await fillConstruction(page, "Druga budowa");
  await expect(page.locator(".job-card")).toHaveCount(2);
  const { data, error } = await admin.from("organizations").select("id").eq("created_by", account.id);
  if (error) throw error;
  expect(data).toHaveLength(0);
});

for (const kind of ["contractor", "store"]) {
  test(`${kind} profile, owner-only employee provisioning and mandatory password change`, async ({ page, request }) => {
    const owner = await createAccount();
    const outsider = await createAccount();
    await login(page, owner.email);
    await page.locator(`.account-type-card.type-${kind}`).click();
    await expect(page.getByRole("heading", { name: kind === "store" ? "Dane Twojego sklepu" : "Dane Twojej firmy" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`${kind}-profile.png`), fullPage: true });
    await fillBusiness(page, kind, await unusedNip());
    await expect(page.getByText("Małopolskie · do 50 km", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: `E2E ${kind}`, exact: true }).first()).toBeVisible();
    const { data: business, error } = await admin.from("organizations").select("id").eq("created_by", owner.id).single();
    if (error) throw error;
    const body = { business_id: business.id, email: `employee-${randomUUID()}@example.test`, display_name: "Pracownik testowy" };
    const unauthenticated = await request.post("/api/employees", { data: body });
    expect(unauthenticated.status()).toBe(401);
    const outsiderToken = await tokenFor(outsider.email);
    const forbidden = await request.post("/api/employees", { data: body, headers: { Authorization: `Bearer ${outsiderToken}` } });
    expect(forbidden.status()).toBe(403);
    await page.getByRole("button", { name: "Pracownicy", exact: true }).click();
    await page.getByLabel("Imię i nazwisko", { exact: true }).fill(body.display_name);
    await page.getByLabel("E-mail pracownika", { exact: true }).fill(body.email);
    await page.getByRole("button", { name: "Utwórz konto i wygeneruj hasło", exact: true }).click();
    await expect(page.getByText("Konto pracownika utworzone", { exact: true })).toBeVisible();
    const temporaryPassword = await page.getByLabel("Wygenerowane hasło tymczasowe", { exact: true }).inputValue();
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(24);
    const { data: employee, error: employeeError } = await admin.from("employee_accounts").select("user_id").eq("email", body.email).single();
    if (employeeError) throw employeeError;
    userIds.push(employee.user_id);
    const ownerToken = await tokenFor(owner.email);
    const duplicate = await request.post("/api/employees", { data: body, headers: { Authorization: `Bearer ${ownerToken}` } });
    expect(duplicate.status()).toBe(409);
    await signout(page);
    await login(page, body.email, temporaryPassword);
    await expect(page.getByRole("heading", { name: "Ustaw własne hasło" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pracownicy", exact: true })).toHaveCount(0);
    await page.getByLabel("Hasło tymczasowe", { exact: true }).fill(temporaryPassword);
    await page.getByLabel("Nowe hasło", { exact: true }).fill("Employee-own-password-2026!");
    await page.getByLabel("Powtórz nowe hasło", { exact: true }).fill("Employee-own-password-2026!");
    await page.getByRole("button", { name: "Zapisz hasło i otwórz panel", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Witaj, Pracownik testowy", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dodaj pracownika", exact: true })).toHaveCount(0);
    const employeeToken = await tokenFor(body.email, "Employee-own-password-2026!");
    const memberForbidden = await request.post("/api/employees", { data: {...body,email:`other-${randomUUID()}@example.test`}, headers: { Authorization: `Bearer ${employeeToken}` } });
    expect(memberForbidden.status()).toBe(403);
    await signout(page);
    await login(page, body.email, "Employee-own-password-2026!");
    await expect(page.getByRole("heading", { name: "Witaj, Pracownik testowy", exact: true })).toBeVisible();
  });
}
