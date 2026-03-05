import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeCityName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function toF(c) {
  return (c * 9) / 5 + 32;
}

function wmoToText(code) {
  const map = new Map([
    [0, "Ясно"],
    [1, "Преимущественно ясно"],
    [2, "Переменная облачность"],
    [3, "Пасмурно"],
    [45, "Туман"],
    [48, "Изморозь"],
    [51, "Морось"],
    [53, "Морось"],
    [55, "Сильная морось"],
    [61, "Дождь"],
    [63, "Дождь"],
    [65, "Сильный дождь"],
    [71, "Снег"],
    [73, "Снег"],
    [75, "Сильный снег"],
    [80, "Ливни"],
    [81, "Ливни"],
    [82, "Сильные ливни"],
    [95, "Гроза"],
    [96, "Гроза с градом"],
    [99, "Гроза с градом"],
  ]);
  return map.get(Number(code)) ?? "Погода";
}

async function searchCities(q) {
  const query = normalizeCityName(q);
  if (query.length < 2) return [];

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "7");
  url.searchParams.set("language", "ru");
  url.searchParams.set("format", "json");

  const res = await fetch(url);
  if (!res.ok) throw new Error("Не удалось получить подсказки городов");
  const data = await res.json();

  return (data.results ?? []).map((c) => ({
    id: `${c.latitude},${c.longitude}`,
    name: c.name,
    country: c.country,
    admin1: c.admin1,
    lat: c.latitude,
    lon: c.longitude,
    timezone: c.timezone,
  }));
}

async function fetchForecast({ lat, lon, timezone }) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("timezone", timezone || "auto");

  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "wind_speed_10m",
      "weather_code",
    ].join(",")
  );

  url.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_min",
      "temperature_2m_max",
      "wind_speed_10m_max",
    ].join(",")
  );

  url.searchParams.set("forecast_days", "7");

  const res = await fetch(url);
  if (!res.ok) throw new Error("Не удалось получить прогноз");
  return res.json();
}

export default function App() {
  const [theme, setTheme] = useState("light");
  const [unit, setUnit] = useState("C");

  const [cityInput, setCityInput] = useState("");
  const [pickedCity, setPickedCity] = useState(null);

  const [suggestions, setSuggestions] = useState([]);
  const [suggestError, setSuggestError] = useState("");

  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [favorites, setFavorites] = useState([]);

  const canSearch = useMemo(() => normalizeCityName(cityInput).length >= 2, [cityInput]);

  // ref для закрытия подсказок кликом вне поля
  const searchWrapRef = useRef(null);

  // init
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);

    const savedUnit = localStorage.getItem("unit");
    if (savedUnit === "C" || savedUnit === "F") setUnit(savedUnit);

    const savedFav = safeJsonParse(localStorage.getItem("favorites"), []);
    if (Array.isArray(savedFav)) setFavorites(savedFav);

    const savedCity = safeJsonParse(localStorage.getItem("lastCityObj"), null);
    if (savedCity?.lat && savedCity?.lon) {
      setPickedCity(savedCity);
      setCityInput(savedCity.name || "");
    } else {
      setCityInput("Stockholm");
    }
  }, []);

  // theme persist
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // unit persist
  useEffect(() => {
    localStorage.setItem("unit", unit);
  }, [unit]);

  // favorites persist
  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(favorites));
  }, [favorites]);

  // закрывать подсказки кликом вне блока поиска
  useEffect(() => {
    function onDocClick(e) {
      if (!searchWrapRef.current) return;
      if (!searchWrapRef.current.contains(e.target)) {
        setSuggestions([]);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // suggestions (debounce)
  useEffect(() => {
    let t = null;
    const q = normalizeCityName(cityInput);

    if (q.length < 2) {
      setSuggestions([]);
      setSuggestError("");
      return;
    }

    t = setTimeout(async () => {
      try {
        setSuggestError("");
        const list = await searchCities(q);
        setSuggestions(list);
      } catch (e) {
        setSuggestions([]);
        setSuggestError(e?.message || "Ошибка поиска");
      }
    }, 350);

    return () => clearTimeout(t);
  }, [cityInput]);

  async function loadByCityObject(cityObj) {
    try {
      setError("");
      setLoading(true);
      const data = await fetchForecast(cityObj);
      setWeather(data);
      setPickedCity(cityObj);
      localStorage.setItem("lastCityObj", JSON.stringify(cityObj));
    } catch (e) {
      setWeather(null);
      setError(e?.message || "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSearch) return;

    // если есть подсказки — берём первую
    if (suggestions.length > 0) {
      const c = suggestions[0];
      setSuggestions([]);
      setSuggestError("");
      setCityInput(c.name);
      await loadByCityObject(c);
      return;
    }

    // иначе пробуем найти по вводу
    try {
      setError("");
      setLoading(true);
      const list = await searchCities(cityInput);
      if (!list.length) {
        setError("Город не найден");
        setWeather(null);
        return;
      }
      const c = list[0];
      setSuggestions([]);
      setSuggestError("");
      setCityInput(c.name);
      await loadByCityObject(c);
    } catch (e2) {
      setError(e2?.message || "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }

  function isFavorite(cityObj) {
    if (!cityObj) return false;
    return favorites.some((x) => x.id === cityObj.id);
  }

  function toggleFavorite() {
    if (!pickedCity) return;
    setFavorites((prev) => {
      const exists = prev.some((x) => x.id === pickedCity.id);
      if (exists) return prev.filter((x) => x.id !== pickedCity.id);
      return [pickedCity, ...prev].slice(0, 12);
    });
  }

  const current = weather?.current;
  const daily = weather?.daily;

  const temp = current
    ? unit === "C"
      ? current.temperature_2m
      : toF(current.temperature_2m)
    : null;

  const feels = current
    ? unit === "C"
      ? current.apparent_temperature
      : toF(current.apparent_temperature)
    : null;

  return (
    <div className="page">
      <div className="card">
        <div className="topbar">
          <div>
            <h1 className="title">🌦 Weather App</h1>
            <p className="subtitle">Подсказки городов • 7 дней • Избранное • Без ключей</p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button className="ghost" type="button" onClick={() => setUnit((u) => (u === "C" ? "F" : "C"))}>
              °{unit}
            </button>

            <button
              className="ghost"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label="Toggle theme"
              title="Переключить тему"
              type="button"
            >
              {theme === "dark" ? "☀️ Светлая" : "🌙 Тёмная"}
            </button>
          </div>
        </div>

        <form className="searchRow" onSubmit={onSubmit}>
          <div ref={searchWrapRef} style={{ position: "relative" }}>
            <input
              className="input"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder="Например: Stockholm"
              autoComplete="off"
            />

            {suggestions.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: 0,
                  right: 0,
                  border: "1px solid var(--border)",
                  background: "var(--cardSolid)",
                  borderRadius: 14,
                  overflow: "hidden",
                  boxShadow: "0 16px 44px var(--shadow)",
                  zIndex: 10,
                }}
              >
                {suggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={async () => {
                      setCityInput(c.name);
                      setSuggestions([]);
                      setSuggestError("");
                      await loadByCityObject(c);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      background: "transparent",
                      color: "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    <b>{c.name}</b>{" "}
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>
                      {c.admin1 ? `${c.admin1}, ` : ""}
                      {c.country}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="btn" type="submit" disabled={!canSearch || loading}>
            {loading ? "..." : "Search"}
          </button>

          <button
            className="btnAlt"
            type="button"
            onClick={async () => {
              try {
                setError("");
                setLoading(true);

                if (!navigator.geolocation) {
                  setError("Геолокация не поддерживается.");
                  return;
                }

                const pos = await new Promise((resolve, reject) => {
                  navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                  });
                });

                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;

                const obj = {
                  id: `${lat},${lon}`,
                  name: "Моё местоположение",
                  country: "",
                  admin1: "",
                  lat,
                  lon,
                  timezone: "auto",
                };

                setSuggestions([]);
                setSuggestError("");
                await loadByCityObject(obj);
              } catch {
                setError("Не удалось получить геолокацию.");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            title="Погода рядом со мной"
          >
            {loading ? "📍..." : "📍 Near me"}
          </button>
        </form>

        {suggestError && <div className="error">⚠️ {suggestError}</div>}
        {error && <div className="error">⚠️ {error}</div>}
        {loading && <div className="loading">Загружаю погоду…</div>}

        <div className="favRow">
          <div className="favTitle">⭐ Избранное:</div>
          <div className="favList">
            {favorites.length === 0 && <span className="muted">пока пусто</span>}
            {favorites.map((f) => (
              <div key={f.id} className="chip">
                <button className="chipBtn" type="button" onClick={() => loadByCityObject(f)} title="Открыть">
                  {f.name}
                </button>
                <button
                  className="chipX"
                  type="button"
                  onClick={() => setFavorites((prev) => prev.filter((x) => x.id !== f.id))}
                  title="Удалить"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {!loading && current && pickedCity && (
          <div className="result">
            <div className="resultHeader">
              <div>
                <h2 className="city">{pickedCity.name}</h2>
                <div className="smallMuted">
                  {pickedCity.admin1 ? `${pickedCity.admin1}, ` : ""}
                  {pickedCity.country}
                </div>
              </div>

              <button className="ghost" type="button" onClick={toggleFavorite} title="Избранное">
                {isFavorite(pickedCity) ? "★ В избранном" : "☆ В избранное"}
              </button>
            </div>

            <div className="grid">
              <div className="box">
                <div className="k">🌡 Температура</div>
                <div className="v">
                  {Math.round(temp)}°{unit}
                </div>
              </div>

              <div className="box">
                <div className="k">🤔 Ощущается</div>
                <div className="v">
                  {Math.round(feels)}°{unit}
                </div>
              </div>

              <div className="box">
                <div className="k">💧 Влажность</div>
                <div className="v">{current.relative_humidity_2m}%</div>
              </div>

              <div className="box">
                <div className="k">🌬 Ветер</div>
                <div className="v">{Math.round(current.wind_speed_10m)} км/ч</div>
              </div>
            </div>

            <div className="forecast">
              <div className="forecastTitle">📅 Прогноз на 7 дней — {wmoToText(current.weather_code)}</div>

              <div className="forecastGrid">
                {daily.time.map((date, i) => {
                  const min = unit === "C" ? daily.temperature_2m_min[i] : toF(daily.temperature_2m_min[i]);
                  const max = unit === "C" ? daily.temperature_2m_max[i] : toF(daily.temperature_2m_max[i]);
                  const code = daily.weather_code[i];

                  return (
                    <div key={date} className="day">
                      <div className="dayDate">
                        {new Date(date).toLocaleDateString("ru-RU", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </div>
                      <div className="dayTemps">
                        <span>
                          min: <b>{Math.round(min)}°{unit}</b>
                        </span>
                        <span>
                          max: <b>{Math.round(max)}°{unit}</b>
                        </span>
                        <span style={{ color: "var(--muted)" }}>
                          ветер: <b>{Math.round(daily.wind_speed_10m_max[i])} км/ч</b>
                        </span>
                      </div>
                      <div className="dayDesc">{wmoToText(code)}</div>
                    </div>
                  );
                })}
              </div>

              <div className="hint">Данные: Open-Meteo (без ключа). Избранное и настройки сохраняются.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}