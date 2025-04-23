const path = require("path");
const chrome = require("selenium-webdriver/chrome");
const { Builder, Browser, By, Key, until } = require("selenium-webdriver");
const notifier = require("node-notifier");
require("chromedriver");

const service = new chrome.ServiceBuilder(path.resolve("./chromedriver.exe"));

(async function example() {
  let driver = await new Builder()
    .forBrowser(Browser.CHROME)
    .usingServer("http://localhost:9515")
    .setChromeService(service)
    .build();

  try {
    await driver.get("https://etk.srail.co.kr/cmc/01/selectLoginForm.do");

    await driver.findElement({ id: "srchDvNm01" }).sendKeys("1896346287");
    await driver.findElement({ id: "hmpgPwdCphd01" }).sendKeys("rlaalwk1!");

    await driver.findElement(By.css("input.loginSubmit")).click();

    const departureStation = "오송";
    const arrivaltStation = "수서";

    await wait(1000);

    await selectOptionByText(driver, "dptRsStnCd", departureStation);
    await selectOptionByText(driver, "arvRsStnCd", arrivaltStation);

    const date = "2025.04.24";
    await driver.executeScript(
      `document.querySelector("input[name=\'dptDt\']").value = "${date}";`
    );

    // time 은 00 ~ 22 사이
    const time = "06";

    await driver
      .findElement(By.css(`#dptTm option[value="${time + "0000"}"]`))
      .click();

    await driver.findElement(By.css("a.btn_burgundy_dark2")).click();

    await driver.sleep(10000)
    

    const betweenTimes = ["07:00", "09:10"];

    let isSuccess = false;

    const duringHour = 1;
    const startTime = Date.now();
    while (!isSuccess) {
      const millis = Date.now() - startTime;
      if (millis / 1000 > duringHour * 60 * 60) {
        break;
      }

      await driver.navigate().refresh();
      await driver.sleep(1000)
      const result = await bookTrainIfAvailable(driver, betweenTimes);

      if (result === "RESTART") {
        console.log("🔄 페이지 초기화 신호 수신! 로그인부터 다시 시도");
        await driver.quit();
        return await example(); // 전체 함수 다시 실행 (재귀 호출)
      }
      isSuccess = result === true;

      
    }

    for (let i = 0; i < 10; i++) {
      notifier.notify({
        title: "SRT 예약 성공!",
        message: "열차 예약에 성공했습니다 🎉",
        sound: true, // 기본 알림 사운드 재생
      });

      await wait(1000);
    }
  } finally {
    // await driver.quit();
  }
})();

async function selectOptionByText(driver, selectId, textToMatch) {
  const options = await driver.findElements(By.css(`#${selectId} option`));
  for (let option of options) {
    const text = await option.getText();
    if (text.trim() === textToMatch) {
      await option.click();
      break;
    }
  }
}

async function bookTrainIfAvailable(driver, departureTimeRange) {
  const [startTime, endTime] = departureTimeRange; // startTime과 endTime을 분리

  // 시간 형식을 비교하기 위해 'HH:MM' -> 'HHmm' 형태로 변환하는 함수
  function convertToMinutes(timeStr) {
    const [hour, minute] = timeStr.split(":").map(Number);
    return hour * 60 + minute;
  }

  // 출발 시간 범위 (startTime ~ endTime)를 분으로 변환
  const startTimeInMinutes = convertToMinutes(startTime);
  const endTimeInMinutes = convertToMinutes(endTime);

  // 테이블에서 각 행을 반복하여, 출발역과 시간을 확인
  let rows = await driver.findElements(By.css("table tbody tr"));

  if (rows.length === 0) {
    console.warn("⚠️ 열차 목록이 없음! 초기화 필요.");
    return "RESTART";
  }

  for (let row of rows) {
    // 각 행에서 출발역과 출발시간을 찾음
    let station = await row
      .findElement(By.css("td:nth-child(4) div"))
      .getText();
    let timeStr = await row
      .findElement(By.css("td:nth-child(4) em.time"))
      .getText();

    // 출발 시간을 분으로 변환
    let [hours, minutes] = timeStr.split(":").map(Number);
    let timeInMinutes = hours * 60 + minutes;

    // 조건에 맞는 출발역과 시간 범위 내의 첫 번째 열차를 찾음

    if (
      timeInMinutes >= startTimeInMinutes &&
      timeInMinutes <= endTimeInMinutes
    ) {
      // 일반실 예약 버튼 찾기 (예약이 가능한 경우)
      let commonReserveButton = await row.findElement(
        By.css("td:nth-child(7) a span")
      );
      // 특실
      let specialReserveButton = await row.findElement(
        By.css("td:nth-child(6) a span")
      );

      let buttonText = await commonReserveButton.getText();

      let specialButtonText = await specialReserveButton.getText();
      if (buttonText === "예약하기") {
        console.log(`[일반실] 예약 가능! 시간: ${timeStr}`);

        // 예약하기 버튼 클릭
        await commonReserveButton.click();

        return true;
      } else if (specialButtonText === "예약하기") {
        console.log(`[특실실] 예약 가능! 시간: ${timeStr}`);

        await specialReserveButton.click();
        return true;
      } else {
        console.log(`예약 불가!  ${timeStr}`);
      }
    }
  }
  console.log(`예약 가능한 열차가 없슴`);
  return false;
}

async function wait(time) {
  return new Promise((res) => {
    setTimeout(() => {
      res();
    }, time);
  });
}
// npx chromedriver --port=9515
