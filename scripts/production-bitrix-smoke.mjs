import { chromium } from 'playwright';

const baseUrl =
  process.env.BASE_URL || 'https://fgn-nn.ru';

const routes = [
  ['/', '8'],
  ['/start.html', '16'],
  ['/kapsulirovanie/', '10'],
  ['/fasovka-sypuchih-produktov/', '16'],
  ['/fasovka-chaya-i-sborov/', '16'],
  ['/upakovka-i-markirovka-bad/', '16'],
  ['/kontraktnoe-proizvodstvo-bad/', '16']
];

const widths = [390, 1366];
const failures = [];
const fail = (message) => failures.push(message);

const browser = await chromium.launch({ headless: true });

try {
  for (const width of widths) {
    for (const [route, id] of routes) {
      const page = await browser.newPage({
        viewport: {
          width,
          height: width < 500 ? 844 : 900
        }
      });

      const runtimeErrors = [];

      page.on('pageerror', (error) => {
        runtimeErrors.push(`PAGEERROR: ${error.message}`);
      });

      page.on('console', (message) => {
        const text = message.text();

        if (
          message.type() === 'error' &&
          /content security policy|violates the following|refused to (?:frame|load|connect|execute)/i.test(text)
        ) {
          runtimeErrors.push(`CSP: ${text}`);
        }
      });

      try {
        const response = await page.goto(
          baseUrl + route,
          {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          }
        );

        if (!response?.ok()) {
          fail(
            `${route} @ ${width}px: HTTP ` +
            `${response?.status() || 'без ответа'}`
          );
        }

        const host = page.locator(
          `iframe[data-bitrix-form-frame="${id}"]`
        ).first();

        await host.waitFor({
          state: 'visible',
          timeout: 20000
        });

        let frame = null;

        for (let attempt = 0; attempt < 40; attempt += 1) {
          frame = page.frames().find((candidate) =>
            candidate.url().includes(
              `/forms/bitrix.html?form=${id}`
            )
          );

          if (frame) break;

          await page.waitForTimeout(250);
        }

        if (!frame) {
          fail(
            `${route} @ ${width}px: iframe формы №${id} ` +
            `не загрузил служебную страницу`
          );
          continue;
        }

        const wrapper = frame
          .locator('.b24-form-wrapper')
          .first();

        await wrapper.waitFor({
          state: 'visible',
          timeout: 20000
        });

        const wrappers = await frame
          .locator('.b24-form-wrapper')
          .count();

        const nodes = await frame
          .locator('[class*="b24"]')
          .count();

        const frameSize = await host.evaluate((element) => ({
          width: Math.round(
            element.getBoundingClientRect().width
          ),
          height: Math.round(
            element.getBoundingClientRect().height
          )
        }));

        const formHeight = Math.ceil(
          await wrapper.evaluate(
            (element) =>
              element.getBoundingClientRect().height
          )
        );

        const difference =
          frameSize.height - formHeight;

        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            window.innerWidth
        );

        if (wrappers !== 1) {
          fail(
            `${route} @ ${width}px: wrappers=${wrappers}`
          );
        }

        if (nodes < 1) {
          fail(
            `${route} @ ${width}px: Bitrix UI отсутствует`
          );
        }

        if (
          frameSize.width < 240 ||
          frameSize.height < 100
        ) {
          fail(
            `${route} @ ${width}px: iframe ` +
            `${frameSize.width}×${frameSize.height}`
          );
        }

        if (Math.abs(difference) > 2) {
          fail(
            `${route} @ ${width}px: лишняя высота iframe ` +
            `${difference}px`
          );
        }

        if (overflow > 1) {
          fail(
            `${route} @ ${width}px: overflow=${overflow}px`
          );
        }

        for (const error of new Set(runtimeErrors)) {
          fail(`${route} @ ${width}px: ${error}`);
        }

        console.log(
          `OK ${route} form=${id} width=${width} ` +
          `iframe=${frameSize.width}x${frameSize.height} ` +
          `nodes=${nodes}`
        );
      } catch (error) {
        fail(
          `${route} @ ${width}px: ` +
          `${error.message}`
        );
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(
    `Production Bitrix smoke failed: ${failures.length}`
  );

  failures.forEach((failure) =>
    console.error(`- ${failure}`)
  );

  process.exit(1);
}

console.log(
  `Production Bitrix smoke passed: ` +
  `${routes.length} routes × ${widths.length} widths.`
);
