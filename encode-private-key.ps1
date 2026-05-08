# PowerShell script to encode Firebase private key for Netlify
# Run this script and copy the output

# Paste your FULL private key here between @'
$privateKey = @'
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDM5tks758/t3w4
IXxFeZ7kR4KKT1T+cNnPzMI4ZbcJQO/XKvuox4aI36B49+dNn5py2nuRClLTgudD
s7lulRKDSB2wpkNuO4zIIfLQeDgVnzfZK9/SM5uPlAshWNjpgArPKfe8X4bWrMl3
ItKjc11z4GI4mnAeC+RpoyKvrnTtEh4xkDghlEY04p4cmFVkrI7C6xMqKKqjx2Wm
EaDWnLnpLIt2nmQXG4+VXWLs3NMRuHGJwVlJocQbAfhopNR9X+YaWLU4oMA/PajX
G/irdmK5NGTlu9tih7PRXwqCe5DJ68l3co0KExvcIokKoN0yg0UVEeCXL2sCnOH6
wrZzilW/AgMBAAECggEAOF9Yp67DSuXhxJWd2YVk7Bwqc3/w+9GzcyK72oVNbrvR
YIrAUwaV4mlX/oABwI7lEK1Aar6C3BM7KhqzrRNRVRINrRCJI7Y5fMQuSCGTGIvF
8zdJbEzrgvxxdXq6rr8d+jHrKQXFFKHUCbVoazStpNg6XaVLrFCMRm3t+JSQMbqY
H76cibZlySVTzHGL9/Kj9TiCdaCLiL3YDSxHZV6d/aMhB8A83WE2CXbS/ca/S27O
6XcV4tTMuKxOwz7ZBiErwdTcUH79QnmOV48SazXC268cbZEbMVAsTcplE0pzjsYl
LcI8ef1cjR368RffUNH1yqmGhbbM/Ep2W46ACUHUmQKBgQD+e5V/USkPlqc7qj1y
6FGD/cwzzvVyF9NxMw0Z365zqQtvisiEvscqNDUSXMhvVGO2yR1e1suMhBlsBheQ
N8IudPynLxnsDealNk86Ne7oRDtf9ZUwgeUJg/dKf4TyocnoD4CNxj4jINCkPil7
3jt8Ao8AtrvQQXAHENXoGzBvJwKBgQDOH5bOMSULyek4d0qD9ij+sHhGmKR/p3Te
u6L4e+AFfTN3BLMgvXgeqb9gb1enA9g+AOiX0ny34JxTkfx/lciDIk1ATP32SHUG
S7YemRQwM4ipGEDWjyzjyo8sU6Tfv8QPSBtsjVhgAmyB4to1Mtb+XtfZELpUb9d+
YIDFWNCDqQKBgHRSAO+FJYOelSpMknHnhvsSEzjLLJ3ODjP75c0h1RfA+R0vDqC+
o0LDQk72YhehN0Lhgq9K9xdvej9KOZMOKZAaoTG58dtYL0jtHiG5bU51gb5G/r6B
YTOMQoim6RoOob+U9mnXZ6ee5D9uun+IASCZ+suUuxxiDNbt9xh09RqZAoGAHE84
Xh9f0CuuDWRM5qzjWn+QNVn3ldTA92pb6rbQwNA+RkVt+LwtCEEWGL+SEU004Oct
CtUM7hA6SDwPqtI+lMwcQg2Q/8dZ00CIxdEOdcROK7M6DH3jk3GZkmP2jAiBe/vS
UGllTuJmVrx6bb4KyyrpiFWE0d3+gcvtQ618DekCgYEA1lvdF+LaTt9tducxajIX
j5NBLOVWdHKnmC9z7Yd2ZyPpd4hmIN9ieOb09KHbA3TiAlhnd4yCzuRHAMjUuVNF
IaTplHSl+rk7mc94rp1Fr/w2yMgznf5nzwjZeUfDEEEnB0osOXi72HchVm+FwIXx
knls5a+b6LjiDtQF+XFhep8=
-----END PRIVATE KEY-----
'@

# Remove any extra whitespace and encode
$cleanKey = $privateKey.Trim()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($cleanKey)
$base64 = [System.Convert]::ToBase64String($bytes)

Write-Host ""
Write-Host "=== COPY THIS ENTIRE LINE TO NETLIFY ===" -ForegroundColor Green
Write-Host ""
Write-Host $base64
Write-Host ""
Write-Host "=== END ===" -ForegroundColor Green
Write-Host ""
Write-Host "Paste the above line as FIREBASE_PRIVATE_KEY in Netlify" -ForegroundColor Yellow
