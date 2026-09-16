import { test, expect, type BrowserContext } from '@playwright/test';

async function session(context: BrowserContext, role: 'user' | 'admin') {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'11111111-1111-4111-8111-111111111111',exp:4102444800,role:'authenticated',test_role:role})}.local-signature`;
  await context.addCookies([{ name:'sb-127-auth-token', value:'base64-' + b64({access_token:token,refresh_token:'local-refresh',expires_at:4102444800,token_type:'bearer',user:{id:'11111111-1111-4111-8111-111111111111'}}), domain:'127.0.0.1',path:'/' }]);
}

test('desktop dropdown works with keyboard, closes on Escape and restores focus', async ({ page }) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  const nav = page.getByRole('navigation', {name:'Navegación principal',exact:true});
  const profiles = nav.getByRole('button', {name:'Perfiles',exact:true});
  await profiles.focus();
  await page.keyboard.press('Enter');
  await expect(profiles).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Tab');
  await expect(nav.getByRole('link',{name:/Profesionales/})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(profiles).toBeFocused();
  await expect(profiles).toHaveAttribute('aria-expanded','false');
});

test('mobile dialog traps focus, restores it and closes on navigation', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const trigger = page.getByRole('button',{name:/Menú/});
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.querySelector('dialog')?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('link',{name:'Learn',exact:true}).click();
  await expect(page).toHaveURL(/\/descubre\/learn/);
  await expect(dialog).not.toBeVisible();
});

for (const role of ['user','admin'] as const) test(`server session ${role} has direct catalogs and correct account access`, async ({page,context}) => {
  await session(context,role);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  await page.getByRole('button',{name:'Mi cuenta',exact:true}).click();
  await expect(page.getByRole('link',{name:'Mi aprendizaje',exact:true})).toBeVisible();
  const admin = page.getByRole('link',{name:'Administrar FILMATTA'});
  if (role === 'admin') await expect(admin).toBeVisible(); else await expect(admin).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation',{name:'Navegación principal',exact:true}).getByRole('link',{name:'Learn',exact:true})).toHaveAttribute('href','/cursos');
});

for (const width of [360,390,768,1024,1280,1440,1920]) test(`landings fit ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:1000});
  for (const slug of ['perfiles','talento','locaciones','oportunidades','learn']) {
    await page.goto(`/descubre/${slug}`);
    await expect(page.getByRole('heading',{level:1})).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const img of await page.locator('main img').all()) {
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate(el => (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
    }
    if (width === 390 || width === 1440) await page.screenshot({path:`docs/review/${slug}-${width}.png`,fullPage:true});
  }
});

test('protected owner and admin routes still reject anonymous visitors', async ({page}) => {
  for (const route of ['/mi-perfil','/mis-locaciones','/admin']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/(login|acceso)/);
  }
});
