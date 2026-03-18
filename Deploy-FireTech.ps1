
Write-Host "Starting FireTech Arch Deployment..." -ForegroundColor Cyan


if (!(wsl -l | Select-String "archlinux")) {
    Write-Host "Installing Arch Linux..." -ForegroundColor Yellow
    wsl --install archlinux
}


Write-Host "Configuring Arch Linux Environment..." -ForegroundColor Yellow
wsl -d archlinux -u root -- bash -c @"
    # Update and Install
    pacman -Syu --noconfirm
    pacman -S --noconfirm git nodejs npm postgresql sudo nano

    # Setup Database
    mkdir -p /run/postgresql
    chown postgres:postgres /run/postgresql
    sudo -u postgres initdb -D /var/lib/postgres/data
    sudo -u postgres postgres -D /var/lib/postgres/data > /dev/null 2>&1 &
    sleep 3
    sudo -u postgres createdb railway

    # Clone and Install App
    cd ~
    git clone https://github.com/dhurghamCreation/FireTech-Messager-Server.git
    cd FireTech-Messager-Server
    npm install

    # Create .env
    echo "DATABASE_URL=postgresql://postgres@localhost:5432/railway" > .env
    echo "JWT_SECRET=firetech_secret_123" >> .env
    echo "PORT=3000" >> .env

    # Start Server
    Write-Host "SERVER IS STARTING..."
    node server.js
"@

Write-Host "Deployment Finished!" -ForegroundColor Green
