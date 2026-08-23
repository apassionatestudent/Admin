import './themeToggle.css';
import { useTheme } from '../../context/themeContext.jsx';

// => Actual picture icons instead of the student dashboard's emoji thumb,
// => per project convention. Both need to be added under assets/icons/.
import sunIcon from '../../assets/icons/sun.png';
import moonIcon from '../../assets/icons/moon.png';

export default function ThemeToggle() {
    const { isDark, toggleTheme } = useTheme();

    return (
        <button
            type="button"
            className="theme-switch"
            role="switch"
            aria-checked={isDark}
            aria-label="Toggle theme"
            onClick={toggleTheme}
            title="Switch to day/night mode"
        >
            <span className={`theme-switch-track ${isDark ? 'is-dark' : 'is-light'}`} aria-hidden="true">
                <span className="theme-switch-thumb">
                    <img
                        src={isDark ? moonIcon : sunIcon}
                        alt=""
                        className="theme-switch-icon"
                    />
                </span>
            </span>
        </button>
    );
}
