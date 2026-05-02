package browser

import (
	"math"
	"testing"
)

const epsilon = 0.01

func approxEqual(a, b, tol float64) bool {
	return math.Abs(a-b) < tol
}

// --- ContrastRatio tests ---

func TestContrastRatioWhiteOnBlack(t *testing.T) {
	white := Color{R: 1, G: 1, B: 1, A: 1}
	black := Color{R: 0, G: 0, B: 0, A: 1}
	ratio := ContrastRatio(white, black)
	if !approxEqual(ratio, 21.0, epsilon) {
		t.Errorf("white on black: got %.2f, want 21.0", ratio)
	}
}

func TestContrastRatioBlackOnBlack(t *testing.T) {
	black := Color{R: 0, G: 0, B: 0, A: 1}
	ratio := ContrastRatio(black, black)
	if !approxEqual(ratio, 1.0, epsilon) {
		t.Errorf("black on black: got %.2f, want 1.0", ratio)
	}
}

func TestContrastRatioSameColor(t *testing.T) {
	c := Color{R: 0.5, G: 0.3, B: 0.7, A: 1}
	ratio := ContrastRatio(c, c)
	if !approxEqual(ratio, 1.0, epsilon) {
		t.Errorf("same color: got %.2f, want 1.0", ratio)
	}
}

func TestContrastRatioSymmetric(t *testing.T) {
	fg := Color{R: 1, G: 0, B: 0, A: 1}
	bg := Color{R: 0, G: 0, B: 1, A: 1}
	r1 := ContrastRatio(fg, bg)
	r2 := ContrastRatio(bg, fg)
	if !approxEqual(r1, r2, epsilon) {
		t.Errorf("asymmetric contrast: fg-bg=%.2f, bg-fg=%.2f", r1, r2)
	}
}

// --- MeetsAA tests ---

func TestMeetsAANormalText(t *testing.T) {
	// 4.5:1 threshold for normal text
	if MeetsAA(4.4, false) {
		t.Error("4.4:1 should NOT meet AA for normal text")
	}
	if !MeetsAA(4.5, false) {
		t.Error("4.5:1 should meet AA for normal text")
	}
	if !MeetsAA(5.0, false) {
		t.Error("5.0:1 should meet AA for normal text")
	}
}

func TestMeetsAALargeText(t *testing.T) {
	// 3:1 threshold for large text
	if MeetsAA(2.9, true) {
		t.Error("2.9:1 should NOT meet AA for large text")
	}
	if !MeetsAA(3.0, true) {
		t.Error("3.0:1 should meet AA for large text")
	}
	if !MeetsAA(4.0, true) {
		t.Error("4.0:1 should meet AA for large text")
	}
}

// --- MeetsAAA tests ---

func TestMeetsAAANormalText(t *testing.T) {
	// 7:1 threshold for normal text
	if MeetsAAA(6.9, false) {
		t.Error("6.9:1 should NOT meet AAA for normal text")
	}
	if !MeetsAAA(7.0, false) {
		t.Error("7.0:1 should meet AAA for normal text")
	}
	if !MeetsAAA(10.0, false) {
		t.Error("10.0:1 should meet AAA for normal text")
	}
}

func TestMeetsAAALargeText(t *testing.T) {
	// 4.5:1 threshold for large text
	if MeetsAAA(4.4, true) {
		t.Error("4.4:1 should NOT meet AAA for large text")
	}
	if !MeetsAAA(4.5, true) {
		t.Error("4.5:1 should meet AAA for large text")
	}
	if !MeetsAAA(7.0, true) {
		t.Error("7.0:1 should meet AAA for large text")
	}
}

// --- ParseColor tests ---

func TestParseColorHex3(t *testing.T) {
	c, err := ParseColor("#fff")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !approxEqual(c.R, 1.0, epsilon) || !approxEqual(c.G, 1.0, epsilon) || !approxEqual(c.B, 1.0, epsilon) {
		t.Errorf("#fff: got R=%.2f G=%.2f B=%.2f, want 1.0 1.0 1.0", c.R, c.G, c.B)
	}
}

func TestParseColorHex6(t *testing.T) {
	c, err := ParseColor("#ffffff")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !approxEqual(c.R, 1.0, epsilon) || !approxEqual(c.G, 1.0, epsilon) || !approxEqual(c.B, 1.0, epsilon) {
		t.Errorf("#ffffff: got R=%.2f G=%.2f B=%.2f, want 1.0 1.0 1.0", c.R, c.G, c.B)
	}
}

func TestParseColorHexRed(t *testing.T) {
	c, err := ParseColor("#FF0000")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !approxEqual(c.R, 1.0, epsilon) || !approxEqual(c.G, 0.0, epsilon) || !approxEqual(c.B, 0.0, epsilon) {
		t.Errorf("#FF0000: got R=%.2f G=%.2f B=%.2f, want 1.0 0.0 0.0", c.R, c.G, c.B)
	}
}

func TestParseColorRGB(t *testing.T) {
	c, err := ParseColor("rgb(255, 0, 0)")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !approxEqual(c.R, 1.0, epsilon) || !approxEqual(c.G, 0.0, epsilon) || !approxEqual(c.B, 0.0, epsilon) {
		t.Errorf("rgb(255,0,0): got R=%.2f G=%.2f B=%.2f, want 1.0 0.0 0.0", c.R, c.G, c.B)
	}
	if !approxEqual(c.A, 1.0, epsilon) {
		t.Errorf("rgb(255,0,0): got A=%.2f, want 1.0", c.A)
	}
}

func TestParseColorRGBA(t *testing.T) {
	c, err := ParseColor("rgba(255, 0, 0, 0.5)")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !approxEqual(c.R, 1.0, epsilon) || !approxEqual(c.G, 0.0, epsilon) || !approxEqual(c.B, 0.0, epsilon) {
		t.Errorf("rgba(255,0,0,0.5): got R=%.2f G=%.2f B=%.2f, want 1.0 0.0 0.0", c.R, c.G, c.B)
	}
	if !approxEqual(c.A, 0.5, epsilon) {
		t.Errorf("rgba(255,0,0,0.5): got A=%.2f, want 0.5", c.A)
	}
}

func TestParseColorNamedWhite(t *testing.T) {
	c, err := ParseColor("white")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !approxEqual(c.R, 1.0, epsilon) || !approxEqual(c.G, 1.0, epsilon) || !approxEqual(c.B, 1.0, epsilon) {
		t.Errorf("white: got R=%.2f G=%.2f B=%.2f, want 1.0 1.0 1.0", c.R, c.G, c.B)
	}
}

func TestParseColorNamedBlack(t *testing.T) {
	c, err := ParseColor("black")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !approxEqual(c.R, 0.0, epsilon) || !approxEqual(c.G, 0.0, epsilon) || !approxEqual(c.B, 0.0, epsilon) {
		t.Errorf("black: got R=%.2f G=%.2f B=%.2f, want 0.0 0.0 0.0", c.R, c.G, c.B)
	}
}

func TestParseColorNamedRed(t *testing.T) {
	c, err := ParseColor("red")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !approxEqual(c.R, 1.0, epsilon) || !approxEqual(c.G, 0.0, epsilon) || !approxEqual(c.B, 0.0, epsilon) {
		t.Errorf("red: got R=%.2f G=%.2f B=%.2f, want 1.0 0.0 0.0", c.R, c.G, c.B)
	}
}

func TestParseColorNamedBlue(t *testing.T) {
	c, err := ParseColor("blue")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !approxEqual(c.R, 0.0, epsilon) || !approxEqual(c.G, 0.0, epsilon) || !approxEqual(c.B, 1.0, epsilon) {
		t.Errorf("blue: got R=%.2f G=%.2f B=%.2f, want 0.0 0.0 1.0", c.R, c.G, c.B)
	}
}

func TestParseColorInvalid(t *testing.T) {
	invalids := []string{
		"",
		"notacolor",
		"#xyz",
		"#12345",
		"rgb()",
		"rgb(a, b, c)",
		"hsl(0, 100%, 50%)",
	}
	for _, s := range invalids {
		_, err := ParseColor(s)
		if err == nil {
			t.Errorf("expected error for %q, got nil", s)
		}
	}
}

// --- RelativeLuminance tests ---

func TestRelativeLuminanceBlack(t *testing.T) {
	black := Color{R: 0, G: 0, B: 0, A: 1}
	lum := RelativeLuminance(black)
	if !approxEqual(lum, 0.0, epsilon) {
		t.Errorf("black luminance: got %.4f, want 0.0", lum)
	}
}

func TestRelativeLuminanceWhite(t *testing.T) {
	white := Color{R: 1, G: 1, B: 1, A: 1}
	lum := RelativeLuminance(white)
	if !approxEqual(lum, 1.0, epsilon) {
		t.Errorf("white luminance: got %.4f, want 1.0", lum)
	}
}

func TestRelativeLuminancePureRed(t *testing.T) {
	red := Color{R: 1, G: 0, B: 0, A: 1}
	lum := RelativeLuminance(red)
	// Pure red sRGB: 0.2126 * 1.0 + 0 + 0 = 0.2126
	if !approxEqual(lum, 0.2126, epsilon) {
		t.Errorf("red luminance: got %.4f, want 0.2126", lum)
	}
}

func TestRelativeLuminancePureGreen(t *testing.T) {
	green := Color{R: 0, G: 1, B: 0, A: 1}
	lum := RelativeLuminance(green)
	// Pure green sRGB: 0.7152 * 1.0 = 0.7152
	if !approxEqual(lum, 0.7152, epsilon) {
		t.Errorf("green luminance: got %.4f, want 0.7152", lum)
	}
}

func TestRelativeLuminancePureBlue(t *testing.T) {
	blue := Color{R: 0, G: 0, B: 1, A: 1}
	lum := RelativeLuminance(blue)
	// Pure blue sRGB: 0.0722 * 1.0 = 0.0722
	if !approxEqual(lum, 0.0722, epsilon) {
		t.Errorf("blue luminance: got %.4f, want 0.0722", lum)
	}
}

func TestRelativeLuminanceMidGray(t *testing.T) {
	// sRGB 0.5 -> linear ~0.214
	gray := Color{R: 0.5, G: 0.5, B: 0.5, A: 1}
	lum := RelativeLuminance(gray)
	// (0.2126 + 0.7152 + 0.0722) * linearize(0.5) = 1.0 * 0.2140 = 0.2140
	expected := linearize(0.5) // ~0.2140
	if !approxEqual(lum, expected, epsilon) {
		t.Errorf("mid-gray luminance: got %.4f, want %.4f", lum, expected)
	}
}

// --- Integration tests: ParseColor + ContrastRatio ---

func TestParseAndContrastWhiteBlack(t *testing.T) {
	white, err := ParseColor("#ffffff")
	if err != nil {
		t.Fatal(err)
	}
	black, err := ParseColor("#000000")
	if err != nil {
		t.Fatal(err)
	}
	ratio := ContrastRatio(white, black)
	if !approxEqual(ratio, 21.0, epsilon) {
		t.Errorf("parsed white/black contrast: got %.2f, want 21.0", ratio)
	}
}

func TestParseAndContrastNamedColors(t *testing.T) {
	white, _ := ParseColor("white")
	black, _ := ParseColor("black")
	ratio := ContrastRatio(white, black)
	if !approxEqual(ratio, 21.0, epsilon) {
		t.Errorf("named white/black contrast: got %.2f, want 21.0", ratio)
	}
}

func TestMeetsAAWithRealColors(t *testing.T) {
	white, _ := ParseColor("white")
	black, _ := ParseColor("black")
	ratio := ContrastRatio(white, black)
	if !MeetsAA(ratio, false) {
		t.Error("white on black should meet AA for normal text")
	}
	if !MeetsAA(ratio, true) {
		t.Error("white on black should meet AA for large text")
	}
	if !MeetsAAA(ratio, false) {
		t.Error("white on black should meet AAA for normal text")
	}
}
