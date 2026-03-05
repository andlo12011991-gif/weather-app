import { useEffect, useMemo, useState } from "react";
import "./App.css";

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default function App() {
  // поле ввода
  const [city, setCity] = useState("");

  // что реально показываем как заголовок (например "Моё местоположение")
  const [displayTitle, setDisplayTitle] = useState("");

  // данные погоды
  const [weather, setWeather] = useState(null);

  // состояния
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState("");

  // тема
  const [theme, setTheme] = useState("light");

  // избранное
  const [favorites, setFavorites] = useState([]);

  // можно ли искать
  const canSearch = useMemo(() => city.trim().length >= 2, [city]);

  // ---- загрузка настроек при старте ----
  useEffect(() => {
    // тема
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);

    // избранное
    const savedFav = safeJsonParse(localStorage.getItem("favorites"), []);
    if (Array.isArray(savedFav)) setFavorites(savedFav);

    // последний город
    const savedCity = localStorage.getItem("lastCity") || "Stockholm";
    setCity(savedCity);

    // сразу загрузим погоду
    fetchByCity(savedCity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // применять тему к странице
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // сохранять избранное
  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(favorites));
  }, [favorites]);

  // ---- запросы ----
  async function fetchWttr(query) {
    const url = `https://wttr.in/${encodeURIComponent(query)}?format=j1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Ошибка запроса к сервису погоды");
    return await res.json();
  }

  async function fetchByCity(nameFromArg) {
    const name = (nameFromArg ?? city).trim();

    setError("");
    setWeather(null);
    setDisplayTitle("");

    if (name.length < 2) {
      setError("Введите город (минимум 2 буквы)");
      return;
    }

    try {
      setLoading(true);
      const data = await fetchWttr(name);
      setWeather(data);

      // заголовок — то, что ввёл пользователь
      setDisplayTitle(name);

      // запоминаем
      localStorage.setItem("lastCity", name);
    } catch (e) {
      setError(e?.message || "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }

  function getGeoErrorMessage(code) {
    // 1: PERMISSION_DENIED, 2: POSITION_UNAVAILABLE, 3: TIMEOUT
    if (code === 1) return "Доступ к геолокации запрещён. Разреши в настройках браузера.";
    if (code === 2) return "Не удалось определить местоположение.";
    if (code === 3) return "Геолокация не успела ответить (таймаут).";
    return "Ошибка геолокации.";
  }

  async function fetchNearMe() {
    setError("");
    setWeather(null);
    setDisplayTitle("");

    if (!navigator.geolocation) {
      setError("Геолокация не поддерживается этим браузером.");
      return;
    }

    try {
      setGeoLoading(true);

      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const lat = pos.coords.latitude.toFixed(4);
      const lon = pos.coords.longitude.toFixed(4);

      // wttr умеет принимать "lat,lon"
      const query = `${lat},${lon}`;
      const data = await fetchWttr(query);
      setWeather(data);

      // показываем красивый заголовок
      setDisplayTitle("Моё местоположение");

      // чтобы не путать пользователя координатами — поле ввода оставим как есть,
      // но запомним "последний запрос" как координаты (если хочешь — можно убрать)
      localStorage.setItem("lastCity", city.trim() || "Stockholm");
    } catch (e) {
      if (e?.code) setError(getGeoErrorMessage(e.code));
      else setError(e?.message || "Неизвестная ошибка");
    } finally {
      setGeoLoading(false);
    }
  }

  // ---- избранное ----
  function normalizeCityName(name) {
    return name.trim().replace(/\s+/g, " ");
  }

  function isFavorite(name) {
    const n = normalizeCityName(name).toLowerCase();
    return favorites.some((x) => x.toLowerCase() === n);
  }

  function addFavorite(name) {
    const clean = normalizeCityName(name);
    if (clean.length < 2) return;
    if (isFavorite(clean)) return;
    setFavorites((prev) => [clean, ...prev].slice(0, 12)); // ограничим список до 12
  }

  function removeFavorite(name) {
    const n = normalizeCityName(name).toLowerCase();
    setFavorites((prev) => prev.filter((x) => x.toLowerCase() !== n));
  }

  // ---- данные для отображения ----
  const current = weather?.current_condition?.[0];
  const forecast = weather?.weather?.slice?.(0, 3) || []; // 3 дня

  return (
    <div className="page">
      <div className="card">
        {/* Верхняя панель */}
        <div className="topbar">
          <div>
            <h1 className="title">🌦 Weather App</h1>
            <p className="subtitle">Поиск города • Избранное • 3 дня • Геолокация</p>
          </div>

          <button
            className="ghost"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label="Toggle theme"
            title="Переключить тему"
          >
            {theme === "dark" ? "☀️ Светлая" : "🌙 Тёмная"}
          </button>
        </div>

        {/* Поиск + гео */}
        <form
          className="searchRow"
          onSubmit={(e) => {
            e.preventDefault();
            fetchByCity();
          }}
        >
          <input
            className="input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Например: Stockholm"
          />

          <button className="btn" type="submit" disabled={!canSearch || loading}>
            {loading ? "..." : "Search"}
          </button>

          <button
            className="btnAlt"
            type="button"
            onClick={fetchNearMe}
            disabled={geoLoading}
            title="Погода рядом со мной"
          >
            {geoLoading ? "📍..." : "📍 Near me"}
          </button>
        </form>

        {/* Избранное */}
        <div className="favRow">
          <div className="favTitle">⭐ Избранное:</div>

          <div className="favList">
            {favorites.length === 0 && <span className="muted">пока пусто</span>}

            {favorites.map((f) => (
              <div key={f} className="chip">
                <button
                  className="chipBtn"
                  type="button"
                  onClick={() => {
                    setCity(f);
                    fetchByCity(f);
                  }}
                  title="Открыть"
                >
                  {f}
                </button>
                <button
                  className="chipX"
                  type="button"
                  onClick={() => removeFavorite(f)}
                  title="Удалить"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Ошибки/загрузка */}
        {error && <div className="error">⚠️ {error}</div>}
        {(loading || geoLoading) && <div className="loading">Загружаю погоду…</div>}

        {/* Текущая погода */}
        {!loading && !geoLoading && current && (
          <div className="result">
            <div className="resultHeader">
              <div>
                <h2 className="city">{displayTitle || city.trim()}</h2>
                <div className="smallMuted">
                  (источник: wttr.in)
                </div>
              </div>

              <button
                className="ghost"
                type="button"
                onClick={() => {
                  const name = (displayTitle || city).trim();
                  if (!name) return;
                  if (isFavorite(name)) removeFavorite(name);
                  else addFavorite(name);
                }}
                title="Добавить/убрать из избранного"
              >
                {isFavorite(displayTitle || city) ? "★ В избранном" : "☆ В избранное"}
              </button>
            </div>

            <div className="grid">
              <div className="box">
                <div className="k">🌡 Температура</div>
                <div className="v">{current.temp_C}°C</div>
              </div>

              <div className="box">
                <div className="k">🤔 Ощущается</div>
                <div className="v">{current.FeelsLikeC}°C</div>
              </div>

              <div className="box">
                <div className="k">💧 Влажность</div>
                <div className="v">{current.humidity}%</div>
              </div>

              <div className="box">
                <div className="k">🌬 Ветер</div>
                <div className="v">{current.windspeedKmph} км/ч</div>
              </div>
            </div>

            {/* Прогноз на 3 дня */}
            <div className="forecast">
              <div className="forecastTitle">📅 Прогноз на 3 дня</div>

              <div className="forecastGrid">
                {forecast.map((d) => (
                  <div key={d.date} className="day">
                    <div className="dayDate">{d.date}</div>
                    <div className="dayTemps">
                      <span>min: <b>{d.mintempC}°C</b></span>
                      <span>max: <b>{d.maxtempC}°C</b></span>
                      <span>avg: <b>{d.avgtempC}°C</b></span>
                    </div>
                    <div className="dayDesc">
                      {d?.hourly?.[4]?.weatherDesc?.[0]?.value ||
                        d?.hourly?.[0]?.weatherDesc?.[0]?.value ||
                        "—"}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hint">
                Подсказка: можно нажать Enter для поиска. Последний город и избранное сохраняются.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}